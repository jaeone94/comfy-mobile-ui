/** ComfyUI V3 object_info schemas, expanded into the mobile graph's flat inputs.
 * Wire names intentionally retain dotted paths: these are also the prompt keys.
 */
export const AUTOGROW = 'COMFY_AUTOGROW_V3';
export const DYNAMIC_COMBO = 'COMFY_DYNAMICCOMBO_V3';
type Spec = [string | unknown[], Record<string, any>?];
type Inputs = { required?: Record<string, Spec>; optional?: Record<string, Spec> };
export interface DynamicLayout {
  inputs: any[];
  widgets: any[];
  groups: { name: string; min: number; names: string[][] }[];
}

export function hasDynamicInputs(metadata: any): boolean {
  return Object.values({ ...metadata?.input?.required, ...metadata?.input?.optional })
    .some((spec: any) => spec?.[0] === AUTOGROW || spec?.[0] === DYNAMIC_COMBO);
}

export function expandDynamicInputs(
  metadata: any,
  existingInputs: any[] = [],
  savedValues: any[] | Record<string, any> = [],
  cache = new Map<string, any>(),
): DynamicLayout {
  const layout: DynamicLayout = { inputs: [], widgets: [], groups: [] };
  let valueIndex = 0;
  const readValue = (name: string, key: string, fallback: any) => {
    const saved = Array.isArray(savedValues) ? savedValues[valueIndex++] : savedValues[name];
    return cache.has(key) ? cache.get(key) : saved !== undefined ? saved : fallback;
  };
  const visit = (inputs: Inputs, prefix = '', branch = '', order?: any) => {
    for (const section of ['required', 'optional'] as const) {
      const entries = inputs?.[section] || {};
      const names = [...new Set([...(order?.[section] || []), ...Object.keys(entries)])];
      for (const shortName of names) {
        const spec = entries[shortName];
        if (!spec) continue;
        const name = prefix + shortName;
        const [type, config = {}] = spec;
        const key = JSON.stringify([branch, name, type]);
        if (type === AUTOGROW) {
          const template = config.template;
          if (!template?.input) throw new Error(`Invalid Autogrow template: ${name}`);
          const members = Object.entries({ ...template.input.required, ...template.input.optional }) as [string, Spec][];
          const max = template.names?.length ?? template.max ?? 100;
          const min = Math.min(template.min ?? 1, max);
          const groupNames: string[][] = Array.from({ length: max }, (_, ordinal) => members.map(([member]) =>
            `${name}.${template.names ? template.names[ordinal] : (members.length === 1 ? template.prefix ?? member : member) + ordinal}`));
          let lastConnected = -1;
          groupNames.forEach((row, ordinal) => {
            if (existingInputs.some(input => row.includes(input.name) && input.link != null)) lastConnected = ordinal;
          });
          const count = Math.min(max, Math.max(1, min, lastConnected + 2));
          layout.groups.push({ name, min, names: groupNames });
          for (let ordinal = 0; ordinal < count; ordinal++) {
            members.forEach(([, memberSpec], column) => {
              const [memberType, memberConfig = {}] = memberSpec;
              const inputName = groupNames[ordinal][column];
              const existing = existingInputs.find(input => input.name === inputName);
              const slotType = memberType === 'COMFY_MATCHTYPE_V3'
                ? memberConfig.template?.allowed_types ?? '*' : memberType;
              // Autogrow's scalar templates are connection-only, never widgets.
              layout.inputs.push({ name: inputName, type: Array.isArray(slotType) ? 'COMBO' : slotType,
                link: existing?.link ?? null, label: inputName.slice(name.length + 1) });
            });
          }
          continue;
        }
        const dynamic = type === DYNAMIC_COMBO;
        const choices = dynamic ? (config.options || []).map((option: any) => option.key)
          : Array.isArray(type) ? type : config.options ?? config.values;
        const widgetType = dynamic || Array.isArray(type) ? 'COMBO' : type;
        const existing = existingInputs.find(input => input.name === name);
        const isWidget = dynamic || (!config.forceInput && !config.force_input &&
          (['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'].includes(String(widgetType)) || !!existing?.widget));
        const slot: any = { ...existing, name, type: widgetType,
          link: existing && (existing.type === widgetType || existing.type === '*' || widgetType === '*') ? existing.link ?? null : null };
        let value: any;
        if (isWidget) {
          const fallback = config.default ?? choices?.[0] ?? (type === 'BOOLEAN' ? false : type === 'INT' || type === 'FLOAT' ? 0 : '');
          value = readValue(name, key, fallback);
          slot.widget = { name };
          layout.widgets.push({ name, type: widgetType, value,
            options: { ...config, values: choices, optional: section === 'optional',
              label: config.display_name ?? shortName, dynamicCombo: dynamic, dynamicKey: key } });
        } else {
          delete slot.widget;
        }
        layout.inputs.push(slot);
        if (dynamic) {
          const option = config.options?.find((candidate: any) => candidate.key === value);
          if (option) visit(option.inputs, name + '.', JSON.stringify([branch, name, value]));
        } else if (isWidget && config.control_after_generate) {
          const controlName = shortName === 'seed' || shortName === 'noise_seed'
            ? prefix + 'control_after_generate' : name + '_control_after_generate';
          const controlKey = JSON.stringify([branch, controlName]);
          layout.widgets.push({ name: controlName, type: 'COMBO',
            value: readValue(controlName, controlKey, 'fixed'), serialize: false,
            options: { values: ['fixed', 'increment', 'decrement', 'randomize'], dynamicKey: controlKey } });
        }
      }
    }
  };
  visit(metadata.input, '', '', metadata.input_order);
  return layout;
}

/** Re-index surviving links by slot identity; remove discarded branches at both ends. */
export function reconcileDynamicLinks(node: any, graph: any): void {
  for (const link of Object.values(graph._links || {}) as any[]) {
    if (link.target_id !== node.id) continue;
    const index = node.inputs.findIndex((input: any) => input.link === link.id);
    if (index >= 0) link.target_slot = index;
    else {
      delete graph._links[link.id];
      const source = graph._nodes.find((candidate: any) => candidate.id === link.origin_id);
      const output = source?.outputs?.[link.origin_slot];
      if (output?.links) output.links = output.links.filter((id: number) => id !== link.id);
    }
  }
}

/** Keep the JSON used by the connection picker in sync with the live graph. */
export function syncDynamicWorkflow(graph: any, workflow: any): void {
  workflow.nodes.forEach((node: any) => {
    const live = graph._nodes.find((candidate: any) => candidate.id === node.id);
    if (!live) return;
    node.inputs = live.inputs.map((input: any) => ({ ...input }));
    node.outputs = live.outputs.map((output: any) => ({ ...output, links: output.links ? [...output.links] : output.links }));
    if (hasDynamicInputs(live.nodeData)) node.widgets_values = [...live.widgets_values];
  });
  workflow.links = (Object.values(graph._links) as any[]).map(link =>
    [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot, link.type]);
}
