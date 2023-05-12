import { Injectable } from '@nestjs/common';
import { FieldType, generateFieldId, Relationship, RelationshipRevert } from '@teable-group/core';
import type { Prisma } from '@teable-group/db-main-prisma';
import knex from 'knex';
import type { ISupplementService } from '../../share-db/interface';
import { createFieldInstanceByRo } from './model/factory';
import type { LinkFieldDto } from './model/field-dto/link-field.dto';

@Injectable()
export class FieldSupplementService implements ISupplementService {
  knex: ReturnType<typeof knex>;
  constructor() {
    this.knex = knex({ client: 'sqlite3' });
  }

  async getDbTableName(prisma: Prisma.TransactionClient, tableId: string) {
    const tableMeta = await prisma.tableMeta.findUniqueOrThrow({
      where: { id: tableId },
      select: { dbTableName: true },
    });
    return tableMeta.dbTableName;
  }

  getForeignKeyFieldName(fieldId: string) {
    return `__fk_${fieldId}`;
  }

  async generateSymmetricField(
    prisma: Prisma.TransactionClient,
    tableId: string,
    foreignTableId: string,
    field: LinkFieldDto
  ) {
    const { name: tableName } = await prisma.tableMeta.findUniqueOrThrow({
      where: { id: foreignTableId },
      select: { name: true },
    });

    // lookup field id is the primary field of the table to which it is linked
    const { id: lookupFieldId } = await prisma.field.findFirstOrThrow({
      where: { tableId, isPrimary: true },
      select: { id: true },
    });

    const relationship = RelationshipRevert[field.options.relationship];
    const fieldId = generateFieldId();
    return createFieldInstanceByRo({
      id: fieldId,
      name: tableName,
      type: FieldType.Link,
      options: {
        relationship,
        foreignTableId: foreignTableId,
        lookupFieldId,
        dbForeignKeyName:
          // only OneMany relationShip should generate new foreign key field
          relationship === Relationship.OneMany
            ? this.getForeignKeyFieldName(fieldId)
            : field.options.dbForeignKeyName,
        symmetricFieldId: field.id,
      },
    }) as LinkFieldDto;
  }

  async createForeignKeyField(
    prisma: Prisma.TransactionClient,
    tableId: string, // tableId for current field belongs to
    field: LinkFieldDto
  ) {
    if (field.options.relationship !== Relationship.OneMany) {
      throw new Error('only one-many relationShip should create foreign key field');
    }

    const dbTableName = await this.getDbTableName(prisma, tableId);
    const fieldName = this.getForeignKeyFieldName(field.id);
    const alterTableQuery = this.knex.schema
      .alterTable(dbTableName, (table) => {
        table.string(fieldName).unique().nullable();
      })
      .toQuery();
    await prisma.$executeRawUnsafe(alterTableQuery);
  }

  async supplementByCreate(prisma: Prisma.TransactionClient, tableId: string, field: LinkFieldDto) {
    if (field.type !== FieldType.Link) {
      throw new Error('only link field need to create supplement field');
    }

    const foreignTableId = field.options.foreignTableId;
    const symmetricField = await this.generateSymmetricField(
      prisma,
      tableId,
      foreignTableId,
      field
    );

    if (symmetricField.options.relationship === Relationship.OneMany) {
      await this.createForeignKeyField(prisma, foreignTableId, symmetricField);
    }

    if (field.options.relationship === Relationship.OneMany) {
      await this.createForeignKeyField(prisma, tableId, field);
    }

    return symmetricField;
  }
}
