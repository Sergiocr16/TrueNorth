import 'server-only';

import {
  parseNotionId,
  suggestMapping,
  type NotionSchema,
  type NotionSchemaProperty,
  type NotionSourceKind,
} from '@truenorth/core';
import { NotionClient, NotionError, type NotionDataSource } from './client';
import type { InspectResult } from './types';

/**
 * Reading a database before registering it: what it is called, what its
 * properties are, and the mapping it most likely wants. Nothing is written.
 */

/** Notion names its status groups in English; ours are the three internal ones. */
function groupKey(name: string): 'to_do' | 'in_progress' | 'complete' | undefined {
  const lower = name.toLowerCase();
  if (/complete|done|finaliz/.test(lower)) return 'complete';
  if (/progress|curso/.test(lower)) return 'in_progress';
  if (/to.?do|pendiente|not started/.test(lower)) return 'to_do';
  return undefined;
}

/** The data source object, flattened into the schema the core understands. */
export function schemaFrom(dataSource: NotionDataSource): NotionSchema {
  const title =
    dataSource.title?.map((t) => t.plain_text).join('') || dataSource.name || '';
  const properties: NotionSchemaProperty[] = Object.entries(dataSource.properties).map(
    ([name, raw]) => {
      const property: NotionSchemaProperty = { name: raw.name ?? name, type: raw.type };
      if (raw.type === 'status' && raw.status) {
        const groupOf = new Map<string, 'to_do' | 'in_progress' | 'complete' | undefined>();
        for (const group of raw.status.groups) {
          for (const optionId of group.option_ids) groupOf.set(optionId, groupKey(group.name));
        }
        property.options = raw.status.options.map((o) => {
          const group = groupOf.get(o.id);
          return group ? { name: o.name, group } : { name: o.name };
        });
      } else if (raw.type === 'select' && raw.select) {
        property.options = raw.select.options.map((o) => ({ name: o.name }));
      }
      if (raw.number?.format) property.numberFormat = raw.number.format;
      if (raw.rollup?.function) {
        property.rollupFunction = raw.rollup.function;
        // A percent rollup ("percent_per_group", "percent_checked"…) reads as progress.
        if (/percent/.test(raw.rollup.function)) property.numberFormat = 'percent';
      }
      if (raw.relation?.data_source_id) property.relationDataSourceId = raw.relation.data_source_id;
      return property;
    },
  );
  return { title, properties };
}

export async function inspectDatabase(
  input: string,
  dataSourceId?: string,
  kind?: NotionSourceKind,
): Promise<InspectResult> {
  const id = parseNotionId(input);
  if (!id) throw new NotionError('No parece un enlace ni un id de Notion.', 400, 'bad_id');

  const client = new NotionClient();

  // The pasted id may be the database or the data source itself; try the
  // database first, and fall back to reading it as a data source.
  let databaseId = id;
  let dataSources: { id: string; name: string }[] = [];
  let title = '';
  try {
    const database = await client.database(id);
    databaseId = database.id;
    dataSources = database.data_sources;
    title = database.title.map((t) => t.plain_text).join('');
  } catch (cause) {
    if (!(cause instanceof NotionError) || cause.status !== 404) throw cause;
    dataSources = [{ id, name: '' }];
  }

  if (dataSources.length === 0) {
    throw new NotionError('La base no tiene ninguna fuente de datos.', 400, 'no_data_source');
  }
  const chosen = dataSourceId ?? dataSources[0]!.id;
  const dataSource = await client.dataSource(chosen);
  const schema = schemaFrom(dataSource);
  if (!title) title = schema.title;
  const suggested = suggestMapping(schema, kind);

  return {
    databaseId,
    dataSourceId: dataSource.id,
    title: title || schema.title || 'Base de Notion',
    dataSources,
    schema,
    suggested,
    kind: suggested.kind,
  };
}
