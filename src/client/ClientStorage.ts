import {
  execpool,
  memoize,
  queued,
  singleshot,
  SortedArray,
} from "functools-kit";
import {
  IStorage,
  IStorageData,
  IStorageParams,
} from "../interfaces/Storage.interface";
import { GLOBAL_CONFIG } from "../config/params";
import { IBusEvent } from "../model/Event.model";
import { Embeddings } from "../interfaces/Embedding.interface";
import { createHash } from "crypto";

/**
 * Creates a SHA-256 hash of the provided string.
 *
 * @param {string} string - The input string to be hashed.
 * @returns {string} A hexadecimal representation of the SHA-256 hash.
 *
 * @example
 * // Returns "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3"
 * createSHA256Hash("Hello, world!");
 */
function createSHA256Hash(string: string) {
  return createHash("sha256").update(string).digest("hex");
}

/**
 * Type representing possible storage actions for ClientStorage operations.
 * Used in dispatch to determine the action type (upsert, remove, or clear).
 * @typedef {"upsert" | "remove" | "clear"} Action
 */
type Action = "upsert" | "remove" | "clear";

/**
 * Type representing the payload for storage actions in ClientStorage.
 * Defines the structure for upsert and remove operations, with optional fields based on action type.
 * @template T - The type of storage data, extending IStorageData from Storage.interface.
 * @typedef {Object} Payload
 * @property {IStorageData["id"]} itemId - The ID of the item, required for remove actions.
 * @property {T} item - The item data to upsert, required for upsert actions.
 */
type Payload<T extends IStorageData = IStorageData> = {
  itemId: IStorageData["id"];
  item: T;
};

/**
 * Creates embeddings and an index for a given item, memoized by item ID in _createEmbedding.
 * Invokes the onCreate callback if provided, supporting EmbeddingSchemaService’s embedding generation.
 * @template T - The type of storage data, extending IStorageData from Storage.interface.
 * @param {T} item - The item to create embeddings for, containing data to be indexed.
 * @param {ClientStorage<T>} self - The ClientStorage instance managing embeddings and storage.
 * @returns {Promise<readonly [Embeddings, string]>} A tuple containing the embeddings (from Embedding.interface) and index string.
 * @private
 */
const CREATE_EMBEDDING_FN = async <T extends IStorageData = IStorageData>(
  item: T,
  self: ClientStorage<T>
): Promise<readonly [Embeddings, string]> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    self.params.logger.debug(
      `ClientStorage storageName=${self.params.storageName} clientId=${self.params.clientId} shared=${self.params.shared} _createEmbedding`,
      {
        id: item.id,
      }
    );
  const index = await self.params.createIndex(item);
  const hash = createSHA256Hash(index);
  let embeddings = await self.params.readEmbeddingCache(
    self.params.embedding,
    hash
  );
  if (!embeddings) {
    embeddings = await self.params.createEmbedding(
      index,
      self.params.embedding
    );
    await self.params.writeEmbeddingCache(
      embeddings,
      self.params.embedding,
      hash
    );
  }
  if (self.params.onCreate) {
    self.params.onCreate(
      index,
      embeddings,
      self.params.clientId,
      self.params.embedding
    );
  }
  return [embeddings, index] as const;
};

/**
 * Waits for the ClientStorage instance to initialize by loading initial data and creating embeddings.
 * Uses execpool for concurrent embedding creation, controlled by GLOBAL_CONFIG.CC_STORAGE_SEARCH_POOL.
 * Ensures initialization happens only once via singleshot in waitForInit, supporting StorageConnectionService.
 * @param {ClientStorage} self - The ClientStorage instance to initialize.
 * @returns {Promise<void>} Resolves when initial data is loaded and embeddings are created.
 * @private
 */
const WAIT_FOR_INIT_FN = async (self: ClientStorage): Promise<void> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    self.params.logger.debug(
      `ClientStorage storageName=${self.params.storageName} clientId=${self.params.clientId} shared=${self.params.shared} waitForInit`
    );
  if (!self.params.getData) {
    return;
  }
  const data = await self.params.getData(
    self.params.clientId,
    self.params.storageName,
    await self.params.getDefaultData(
      self.params.clientId,
      self.params.storageName
    )
  );
  await Promise.all(
    data.map(
      execpool(self._createEmbedding, {
        delay: 10,
        maxExec: GLOBAL_CONFIG.CC_STORAGE_SEARCH_POOL,
      })
    )
  );
  self._itemMap = new Map(data.map((item) => [item.id, item]));
};

/**
 * Upserts an item into the storage, updates embeddings, and persists the data via params.setData.
 * Invokes the onUpdate callback and emits an event via BusService, supporting ClientAgent’s data storage needs.
 * @template T - The type of storage data, extending IStorageData from Storage.interface.
 * @param {T} item - The item to upsert, containing the data and ID.
 * @param {ClientStorage<T>} self - The ClientStorage instance managing the item map and embeddings.
 * @returns {Promise<void>} Resolves when the item is upserted, embeddings are updated, and the event is emitted.
 * @private
 */
const UPSERT_FN = async <T extends IStorageData = IStorageData>(
  item: T,
  self: ClientStorage<T>
): Promise<void> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    self.params.logger.debug(
      `ClientStorage storageName=${self.params.storageName} clientId=${self.params.clientId} shared=${self.params.shared} upsert`,
      {
        item,
      }
    );
  self._itemMap.set(item.id, item);
  self._createEmbedding.clear(item.id);
  await self._createEmbedding(item);
  const data = [...self._itemMap.values()];
  if (self.params.setData) {
    await self.params.setData(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  if (self.params.callbacks?.onUpdate) {
    self.params.callbacks?.onUpdate(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  await self.params.bus.emit<IBusEvent>(self.params.clientId, {
    type: "upsert",
    source: "storage-bus",
    input: {
      item,
    },
    output: {},
    context: {
      storageName: self.params.storageName,
    },
    clientId: self.params.clientId,
  });
};

/**
 * Removes an item from the storage by its ID, updates embeddings cache, and persists the data via params.setData.
 * Invokes the onUpdate callback and emits an event via BusService, supporting ClientAgent’s data management.
 * @param {IStorageData["id"]} itemId - The ID of the item to remove, sourced from Storage.interface.
 * @param {ClientStorage} self - The ClientStorage instance managing the item map and embeddings.
 * @returns {Promise<void>} Resolves when the item is removed, cache is cleared, and the event is emitted.
 * @private
 */
const REMOVE_FN = async (
  itemId: IStorageData["id"],
  self: ClientStorage
): Promise<void> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    self.params.logger.debug(
      `ClientStorage storageName=${self.params.storageName} clientId=${self.params.clientId} shared=${self.params.shared} remove`,
      {
        id: itemId,
      }
    );
  self._itemMap.delete(itemId);
  self._createEmbedding.clear(itemId);
  const data = [...self._itemMap.values()];
  if (self.params.setData) {
    await self.params.setData(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  if (self.params.callbacks?.onUpdate) {
    self.params.callbacks?.onUpdate(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  await self.params.bus.emit<IBusEvent>(self.params.clientId, {
    type: "remove",
    source: "storage-bus",
    input: {
      itemId,
    },
    output: {},
    context: {
      storageName: self.params.storageName,
    },
    clientId: self.params.clientId,
  });
};

/**
 * Clears all items from the storage, resets embeddings cache, and persists the empty state via params.setData.
 * Invokes the onUpdate callback and emits an event via BusService, supporting storage reset operations.
 * @param {ClientStorage} self - The ClientStorage instance managing the item map and embeddings.
 * @returns {Promise<void>} Resolves when the storage is cleared, cache is reset, and the event is emitted.
 * @private
 */
const CLEAR_FN = async (self: ClientStorage): Promise<void> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    self.params.logger.debug(
      `ClientStorage storageName=${self.params.storageName} clientId=${self.params.clientId} shared=${self.params.shared} clear`
    );
  self._itemMap.clear();
  self._createEmbedding.clear();
  const data = [];
  if (self.params.setData) {
    await self.params.setData(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  if (self.params.callbacks?.onUpdate) {
    self.params.callbacks?.onUpdate(
      data,
      self.params.clientId,
      self.params.storageName
    );
  }
  await self.params.bus.emit<IBusEvent>(self.params.clientId, {
    type: "clear",
    source: "storage-bus",
    input: {},
    output: {},
    context: {
      storageName: self.params.storageName,
    },
    clientId: self.params.clientId,
  });
};

/**
 * Dispatches a storage action (upsert, remove, or clear) in a queued manner via DISPATCH_FN.
 * Ensures sequential execution of storage operations, validating payloads and handling errors.
 * @template T - The type of storage data, extending IStorageData from Storage.interface.
 * @param {Action} action - The action to perform ("upsert", "remove", or "clear").
 * @param {ClientStorage<T>} self - The ClientStorage instance managing the operation.
 * @param {Partial<Payload<T>>} payload - The payload for the action (item or itemId), partial based on action type.
 * @returns {Promise<void>} Resolves when the action is complete and processed.
 * @throws {Error} If an unknown action is provided or required payload fields (itemId for remove, item for upsert) are missing.
 * @private
 */
const DISPATCH_FN = async <T extends IStorageData = IStorageData>(
  action: Action,
  self: ClientStorage<T>,
  payload: Partial<Payload<T>>
): Promise<void> => {
  if (action === "clear") {
    return await CLEAR_FN(self);
  }
  if (action === "remove") {
    console.assert(
      payload.itemId,
      `agent-swarm ClientStorage REMOVE_FN payload.itemId is required`
    );
    return await REMOVE_FN(payload.itemId!, self);
  }
  if (action === "upsert") {
    console.assert(
      payload.item,
      `agent-swarm ClientStorage UPSERT_FN payload.item is required`
    );
    return await UPSERT_FN(payload.item!, self);
  }
  throw new Error("agent-swarm ClientStorage unknown action");
};

/**
 * Class managing storage operations with embedding-based search capabilities in the swarm system.
 * Implements IStorage, supporting upsert, remove, clear, and similarity-based search with queued operations and event-driven updates.
 * Integrates with StorageConnectionService (instantiation), EmbeddingSchemaService (embeddings), ClientAgent (data storage),
 * SwarmConnectionService (swarm-level storage), and BusService (event emission).
 * @template T - The type of storage data, extending IStorageData from Storage.interface.
 * @implements {IStorage<T>}
 */
export class ClientStorage<T extends IStorageData = IStorageData>
  implements IStorage<T>
{
  /**
   * Internal map to store items by their IDs, used for fast retrieval and updates.
   * Populated during initialization (waitForInit) and modified by upsert, remove, and clear operations.
   * @type {Map<IStorageData["id"], T>}
   */
  _itemMap = new Map<IStorageData["id"], T>();

  /**
   * Constructs a ClientStorage instance with the provided parameters.
   * Invokes the onInit callback if provided and logs construction if debugging is enabled.
   * @param {IStorageParams<T>} params - The storage parameters, including clientId, storageName, createEmbedding, getData, etc.
   */
  constructor(readonly params: IStorageParams<T>) {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} CTOR`,
        {
          params,
        }
      );
    if (this.params.callbacks?.onInit) {
      this.params.callbacks.onInit(
        this.params.clientId,
        this.params.storageName
      );
    }
  }

  /**
   * Dispatches a storage action (upsert, remove, or clear) in a queued manner, delegating to DISPATCH_FN.
   * Ensures sequential execution of storage operations, supporting thread-safe updates from ClientAgent or tools.
   * @param {Action} action - The action to perform ("upsert", "remove", or "clear").
   * @param {Partial<Payload<T>>} payload - The payload for the action (item or itemId), partial based on action type.
   * @returns {Promise<void>} Resolves when the action is queued and processed.
   */
  dispatch = queued(
    async (action, payload) => await DISPATCH_FN<T>(action, this, payload)
  ) as (action: Action, payload: Partial<Payload<T>>) => Promise<void>;

  /**
   * Creates embeddings for the given item, memoized by item ID to avoid redundant calculations via CREATE_EMBEDDING_FN.
   * Caches results for efficiency, cleared on upsert/remove to ensure freshness, supporting EmbeddingSchemaService.
   * @param {T} item - The item to create embeddings for, containing data to be indexed.
   * @returns {Promise<readonly [Embeddings, string]>} A tuple of embeddings (from Embedding.interface) and index string.
   * @private
   */
  _createEmbedding = memoize(
    ([{ id }]) => id,
    async (item: T) => await CREATE_EMBEDDING_FN(item, this)
  );

  /**
   * Waits for the initialization of the storage, loading initial data and creating embeddings via WAIT_FOR_INIT_FN.
   * Ensures initialization happens only once using singleshot, supporting StorageConnectionService’s lifecycle.
   * @returns {Promise<void>} Resolves when initialization is complete and items are loaded into _itemMap.
   */
  waitForInit = singleshot(
    async (): Promise<void> => await WAIT_FOR_INIT_FN(this)
  );

  /**
   * Retrieves a specified number of items based on similarity to a search string, using embeddings and SortedArray.
   * Executes similarity calculations concurrently via execpool, respecting GLOBAL_CONFIG.CC_STORAGE_SEARCH_POOL, and filters by score.
   * Emits an event via BusService, supporting ClientAgent’s search-driven tool execution.
   * @param {string} search - The search string to compare against stored items.
   * @param {number} total - The maximum number of items to return.
   * @param {number} [score=GLOBAL_CONFIG.CC_STORAGE_SEARCH_SIMILARITY] - The minimum similarity score (default from global config).
   * @returns {Promise<T[]>} An array of items sorted by similarity, limited to total and score threshold.
   */
  async take(
    search: string,
    total: number,
    score = GLOBAL_CONFIG.CC_STORAGE_SEARCH_SIMILARITY
  ): Promise<T[]> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} take`,
        {
          search,
          total,
        }
      );
    const indexed = new SortedArray<T>();
    let searchEmbeddings = await this.params.readEmbeddingCache(
      this.params.embedding,
      createSHA256Hash(search)
    );
    if (!searchEmbeddings) {
      searchEmbeddings = await this.params.createEmbedding(
        search,
        this.params.embedding
      );
    }
    if (this.params.onCreate) {
      this.params.onCreate(
        search,
        searchEmbeddings,
        this.params.clientId,
        this.params.embedding
      );
    }
    await Promise.all(
      Array.from(this._itemMap.values()).map(
        execpool(
          async (item) => {
            const [targetEmbeddings, index] = await this._createEmbedding(item);
            const score = await this.params.calculateSimilarity(
              searchEmbeddings,
              targetEmbeddings
            );
            if (this.params.onCompare) {
              this.params.onCompare(
                search,
                index,
                score,
                this.params.clientId,
                this.params.embedding
              );
            }
            indexed.push(item, score);
          },
          {
            delay: 10,
            maxExec: GLOBAL_CONFIG.CC_STORAGE_SEARCH_POOL,
          }
        )
      )
    );
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} take indexed`,
        {
          indexed: indexed.getEntries(),
        }
      );
    if (this.params.callbacks?.onSearch) {
      this.params.callbacks?.onSearch(
        search,
        indexed,
        this.params.clientId,
        this.params.storageName
      );
    }
    await this.params.bus.emit<IBusEvent>(this.params.clientId, {
      type: "take",
      source: "storage-bus",
      input: {
        search,
        total,
        score,
      },
      output: {
        indexed,
      },
      context: {
        storageName: this.params.storageName,
      },
      clientId: this.params.clientId,
    });
    return indexed.take(total, score);
  }

  /**
   * Upserts an item into the storage via the dispatch queue, delegating to UPSERT_FN.
   * Schedules the operation for sequential execution, supporting ClientAgent’s data persistence needs.
   * @param {T} item - The item to upsert, containing the data and ID.
   * @returns {Promise<void>} Resolves when the upsert operation is queued and processed.
   */
  async upsert(item: T): Promise<void> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} upsert scheduled`,
        {
          item,
        }
      );
    return await this.dispatch("upsert", {
      item,
    });
  }

  /**
   * Removes an item from the storage by its ID via the dispatch queue, delegating to REMOVE_FN.
   * Schedules the operation for sequential execution, supporting ClientAgent’s data management.
   * @param {IStorageData["id"]} itemId - The ID of the item to remove, sourced from Storage.interface.
   * @returns {Promise<void>} Resolves when the remove operation is queued and processed.
   */
  async remove(itemId: IStorageData["id"]): Promise<void> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} remove scheduled`,
        {
          id: itemId,
        }
      );
    return await this.dispatch("remove", {
      itemId,
    });
  }

  /**
   * Clears all items from the storage via the dispatch queue, delegating to CLEAR_FN.
   * Schedules the operation for sequential execution, supporting storage reset operations.
   * @returns {Promise<void>} Resolves when the clear operation is queued and processed.
   */
  async clear(): Promise<void> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} clear scheduled`
      );
    return await this.dispatch("clear", {});
  }

  /**
   * Retrieves an item from the storage by its ID directly from _itemMap.
   * Emits an event via BusService with the result, supporting quick lookups by ClientAgent or tools.
   * @param {IStorageData["id"]} itemId - The ID of the item to retrieve, sourced from Storage.interface.
   * @returns {Promise<T | null>} The item if found in _itemMap, or null if not found.
   */
  async get(itemId: IStorageData["id"]): Promise<T | null> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} get`,
        {
          id: itemId,
        }
      );
    const result = this._itemMap.get(itemId) ?? null;
    await this.params.bus.emit<IBusEvent>(this.params.clientId, {
      type: "get",
      source: "storage-bus",
      input: {
        itemId,
      },
      output: {
        result,
      },
      context: {
        storageName: this.params.storageName,
      },
      clientId: this.params.clientId,
    });
    return result;
  }

  /**
   * Lists all items in the storage from _itemMap, optionally filtered by a predicate.
   * Emits an event via BusService with the filtered result if a filter is provided, supporting ClientAgent’s data enumeration.
   * @param {(item: T) => boolean} [filter] - An optional predicate to filter items; if omitted, returns all items.
   * @returns {Promise<T[]>} An array of items, filtered if a predicate is provided.
   */
  async list(filter?: (item: T) => boolean): Promise<T[]> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} list`
      );
    if (!filter) {
      return [...this._itemMap.values()];
    }
    const result: T[] = [];
    for (const item of this._itemMap.values()) {
      if (filter(item)) {
        result.push(item);
      }
    }
    await this.params.bus.emit<IBusEvent>(this.params.clientId, {
      type: "list",
      source: "storage-bus",
      input: {},
      output: {
        result,
      },
      context: {
        storageName: this.params.storageName,
      },
      clientId: this.params.clientId,
    });
    return result;
  }

  /**
   * Disposes of the storage instance, invoking the onDispose callback if provided and logging via BusService.
   * Ensures proper cleanup with StorageConnectionService when the storage is no longer needed.
   * @returns {Promise<void>} Resolves when disposal is complete and logged.
   */
  async dispose(): Promise<void> {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      this.params.logger.debug(
        `ClientStorage storageName=${this.params.storageName} clientId=${this.params.clientId} shared=${this.params.shared} dispose`
      );
    if (this.params.callbacks?.onDispose) {
      this.params.callbacks.onDispose(
        this.params.clientId,
        this.params.storageName
      );
    }
  }
}

/**
 * Default export of the ClientStorage class.
 * Provides the primary implementation of the IStorage interface for managing storage with embedding-based search in the swarm system,
 * integrating with StorageConnectionService, EmbeddingSchemaService, ClientAgent, SwarmConnectionService, and BusService,
 * with queued operations, similarity search, and event-driven updates.
 * @type {typeof ClientStorage}
 */
export default ClientStorage;
