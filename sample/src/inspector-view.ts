import type { ImageEntityInspection, InspectedEntity } from './inspection';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const number = (value: number) => value.toLocaleString('en-US');

/** Presentation only: every key, attribute and byte comes from verified inspection queries. */
export function renderInspection(container: HTMLElement, report: ImageEntityInspection) {
  container.replaceChildren();
  const title = node('h2', 'How this image was retrieved');
  const count = report.chunks.length + (report.manifest ? 2 : 1);
  container.append(title, node('p', `${count} ${count === 1 ? 'entity' : 'entities'} · ${number(report.totalBytes)} image bytes`, 'help'));
  const flow = node('div', undefined, 'entity-flow');
  flow.setAttribute('aria-label', 'Entity retrieval path');
  const panel = node('section', undefined, 'entity-detail');
  panel.setAttribute('aria-label', 'Selected entity');
  const select = node('select'); select.id = 'chunk-select';
  const buttons: HTMLButtonElement[] = [];

  function show(entity: InspectedEntity, name: string, purpose: string, query: string, range?: string) {
    panel.replaceChildren(node('h3', name));
    const key = node('code', entity.key, 'entity-key');
    panel.append(key, node('p', purpose, 'help'));
    if (range) panel.append(node('p', range, 'byte-range'));
    const payloadTitle = node('h4', `Payload · ${number(entity.payload.length)} bytes`);
    const payload = node('pre', undefined, 'payload-preview');
    const code = node('code', entity.payload.length
      ? [...entity.payload.slice(0, 32)].map(v => v.toString(16).padStart(2, '0')).join(' ') + (entity.payload.length > 32 ? ' …' : '')
      : 'Empty payload');
    payload.append(code); panel.append(payloadTitle, payload);
    if (entity === report.manifest) panel.append(node('p', new TextDecoder().decode(entity.payload), 'manifest-json'));
    panel.append(node('h4', 'Attributes · indexed for queries'));
    const table = node('table'); table.className = 'attribute-table';
    const head = node('thead'), headings = node('tr');
    for (const label of ['Name', 'Type', 'Value']) { const th = node('th', label); th.scope = 'col'; headings.append(th); }
    head.append(headings); table.append(head);
    const body = node('tbody');
    for (const attribute of entity.attributes) {
      const row = node('tr');
      row.append(node('td', attribute.name), node('td', attribute.type), node('td', String(attribute.value)));
      body.append(row);
    }
    table.append(body); panel.append(table);
    const details = node('details'), summary = node('summary', 'See the inspection query');
    const queryCode = node('pre'); queryCode.append(node('code', query));
    details.append(summary, node('p', 'Filters use attributes; payload bytes are returned as data.', 'help'), queryCode);
    panel.append(details);
  }
  function stage(label: string, detail: string, callback: () => void) {
    const button = node('button', undefined, 'entity-stage'); button.type = 'button';
    button.append(node('span', label), node('small', detail)); button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      select.hidden = label !== 'Chunks'; callback();
    });
    buttons.push(button); flow.append(button); return button;
  }
  stage('Image entity', report.manifest ? 'Points to manifest' : 'Contains image bytes', () => show(report.root, 'Image entity', report.manifest ? 'The image bytes live in chunks. This entity links to their manifest.' : 'The payload is the complete original image.', report.queries.root));
  if (report.manifest) {
    stage('Manifest', 'Describes the file', () => show(report.manifest!, 'File manifest', 'JSON filename and format in the payload; chunk count and integrity data in attributes.', report.queries.manifest!));
    const showChunk = () => {
      const chunk = report.chunks[Number(select.value)];
      show(chunk, `Chunk ${chunk.seq + 1} of ${report.chunks.length}`, 'A binary slice of the image. The seq attribute determines its position.', report.queries.chunks!, `Bytes ${number(chunk.byteStart)}–${number(chunk.byteEndExclusive - 1)} · zero-based`);
    };
    stage('Chunks', `${report.chunks.length} ordered payloads`, showChunk);
    select.setAttribute('aria-label', 'Choose a chunk entity');
    report.chunks.forEach((chunk, index) => select.add(new Option(`Chunk ${index + 1} · ${number(chunk.payload.length)} bytes`, String(index))));
    select.addEventListener('change', showChunk);
  }
  const complete = node('div', undefined, 'entity-stage verified-stage');
  complete.append(node('span', 'Verified image'), node('small', report.manifest ? 'Join bytes → SHA-256' : 'SHA-256 matches'));
  flow.append(complete); container.append(flow, select, panel);
  const explanation = report.manifest
    ? `Chunks are ordered by seq, then joined into ${number(report.totalBytes)} bytes. The resulting SHA-256 matches the verified image.`
    : 'The payload bytes match the verified image. No chunk assembly is needed.';
  container.append(node('p', explanation, 'help'));
  buttons[0].click();
}
