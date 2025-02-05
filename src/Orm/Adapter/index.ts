/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/// <reference path="../../../adonis-typings/index.ts" />

import { Exception } from '@poppinss/utils'
import { DatabaseContract } from '@ioc:Adonis/Lucid/Database'
import { LucidRow, LucidModel, AdapterContract, ModelAdapterOptions } from '@ioc:Adonis/Lucid/Orm'
import { isObject } from '../../utils'

/**
 * Adapter exposes the API to make database queries and constructor
 * model instances from it.
 */
export class Adapter implements AdapterContract {
  constructor(private db: DatabaseContract) {}

  private getPrimaryKeyColumnName(Model: LucidModel) {
    return Model.$keys.attributesToColumns.get(Model.primaryKey, Model.primaryKey)
  }

  /**
   * Returns the query client based upon the model instance
   */
  public modelConstructorClient(modelConstructor: LucidModel, options?: ModelAdapterOptions) {
    if (options && options.client) {
      return options.client
    }

    const connection = (options && options.connection) || modelConstructor.connection
    const profiler = options && options.profiler
    return this.db.connection(connection, { profiler })
  }

  /**
   * Returns the model query builder instance for a given model
   */
  public query(modelConstructor: LucidModel, options?: ModelAdapterOptions): any {
    const client = this.modelConstructorClient(modelConstructor, options)
    return client.modelQuery(modelConstructor)
  }

  /**
   * Returns query client for a model instance by inspecting it's options
   */
  public modelClient(instance: LucidRow): any {
    const modelConstructor = instance.constructor as unknown as LucidModel
    return instance.$trx
      ? instance.$trx
      : this.modelConstructorClient(modelConstructor, instance.$options)
  }

  /**
   * Perform insert query on a given model instance
   */
  public async insert(instance: LucidRow, attributes: any) {
    const query = instance.$getQueryFor('insert', this.modelClient(instance))

    const Model = instance.constructor as LucidModel
    const result = await query.insert(attributes).reporterData({ model: Model.name })

    if (!Model.selfAssignPrimaryKey && Array.isArray(result) && result[0]) {
      if (isObject(result[0])) {
        instance.$consumeAdapterResult(result[0])
      } else {
        const primaryKeyColumnName = this.getPrimaryKeyColumnName(Model)
        instance.$consumeAdapterResult({ [primaryKeyColumnName]: result[0] })
      }
    }
  }

  /**
   * Perform update query on a given model instance
   */
  public async update(instance: LucidRow, dirty: any) {
    await instance.$getQueryFor('update', this.modelClient(instance)).update(dirty)
  }

  /**
   * Perform delete query on a given model instance
   */
  public async delete(instance: LucidRow) {
    await instance.$getQueryFor('delete', this.modelClient(instance)).del()
  }

  /**
   * Refresh the model instance attributes
   */
  public async refresh(instance: LucidRow) {
    const Model = instance.constructor as LucidModel
    const primaryKeyColumnName = this.getPrimaryKeyColumnName(Model)

    const freshModelInstance = await instance
      .$getQueryFor('refresh', this.modelClient(instance))
      .first()

    if (!freshModelInstance) {
      throw new Exception(
        [
          '"Model.refresh" failed. ',
          `Unable to lookup "${Model.table}" table where "${primaryKeyColumnName}" = ${instance.$primaryKeyValue}`,
        ].join('')
      )
    }

    instance.fill(freshModelInstance.$attributes)
    instance.$hydrateOriginals()
  }
}
