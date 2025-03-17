import fs from "fs/promises";
import {
  getErrorMessage,
  makeExtendable,
  memoize,
  not,
  queued,
  retry,
  singleshot,
  trycatch,
} from "functools-kit";
import { join } from "path";
import { SwarmName } from "../interfaces/Swarm.interface";
import { AgentName } from "../interfaces/Agent.interface";
import { StateName } from "../interfaces/State.interface";
import { IStorageData, StorageName } from "../interfaces/Storage.interface";
import { writeFileAtomic } from "../utils/writeFileAtomic";
import { GLOBAL_CONFIG } from "../config/params";
import swarm from "../lib";
import { SessionId } from "../interfaces/Session.interface";

/**
 * Identifier for an entity, can be a string or number.
 */
export type EntityId = string | number;

/**
 * Base interface for all persistent entities.
 */
export interface IEntity {}

/** @private Symbol for memoizing the wait-for-initialization operation in PersistBase */
const BASE_WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");

/** @private Symbol for creating a new key in a persistent list */
const LIST_CREATE_KEY_SYMBOL = Symbol("create-key");

/** @private Symbol for getting the last key in a persistent list */
const LIST_GET_LAST_KEY_SYMBOL = Symbol("get-last-key");

/** @private Symbol for popping the last item from a persistent list */
const LIST_POP_SYMBOL = Symbol("pop");

// Logging method names for PersistBase
/** @private Constant for logging the constructor in PersistBase */
const PERSIST_BASE_METHOD_NAME_CTOR = "PersistBase.CTOR";
/** @private Constant for logging the waitForInit method in PersistBase */
const PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT = "PersistBase.waitForInit";
/** @private Constant for logging the readValue method in PersistBase */
const PERSIST_BASE_METHOD_NAME_READ_VALUE = "PersistBase.readValue";
/** @private Constant for logging the writeValue method in PersistBase */
const PERSIST_BASE_METHOD_NAME_WRITE_VALUE = "PersistBase.writeValue";
/** @private Constant for logging the hasValue method in PersistBase */
const PERSIST_BASE_METHOD_NAME_HAS_VALUE = "PersistBase.hasValue";
/** @private Constant for logging the removeValue method in PersistBase */
const PERSIST_BASE_METHOD_NAME_REMOVE_VALUE = "PersistBase.removeValue";
/** @private Constant for logging the removeAll method in PersistBase */
const PERSIST_BASE_METHOD_NAME_REMOVE_ALL = "PersistBase.removeAll";
/** @private Constant for logging the values method in PersistBase */
const PERSIST_BASE_METHOD_NAME_VALUES = "PersistBase.values";
/** @private Constant for logging the keys method in PersistBase */
const PERSIST_BASE_METHOD_NAME_KEYS = "PersistBase.keys";

// Logging method names for PersistList
/** @private Constant for logging the constructor in PersistList */
const PERSIST_LIST_METHOD_NAME_CTOR = "PersistList.CTOR";
/** @private Constant for logging the push method in PersistList */
const PERSIST_LIST_METHOD_NAME_PUSH = "PersistList.push";
/** @private Constant for logging the pop method in PersistList */
const PERSIST_LIST_METHOD_NAME_POP = "PersistList.pop";

// Logging method names for PersistSwarmUtils
/** @private Constant for logging the usePersistActiveAgentAdapter method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_USE_PERSIST_ACTIVE_AGENT_ADAPTER =
  "PersistSwarmUtils.usePersistActiveAgentAdapter";
/** @private Constant for logging the usePersistNavigationStackAdapter method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_USE_PERSIST_NAVIGATION_STACK_ADAPTER =
  "PersistSwarmUtils.usePersistNavigationStackAdapter";
/** @private Constant for logging the getActiveAgent method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_GET_ACTIVE_AGENT =
  "PersistSwarmUtils.getActiveAgent";
/** @private Constant for logging the setActiveAgent method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_SET_ACTIVE_AGENT =
  "PersistSwarmUtils.setActiveAgent";
/** @private Constant for logging the getNavigationStack method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_GET_NAVIGATION_STACK =
  "PersistSwarmUtils.getNavigationStack";
/** @private Constant for logging the setNavigationStack method in PersistSwarmUtils */
const PERSIST_SWARM_UTILS_METHOD_NAME_SET_NAVIGATION_STACK =
  "PersistSwarmUtils.setNavigationStack";

// Logging method names for PersistStateUtils
/** @private Constant for logging the usePersistStateAdapter method in PersistStateUtils */
const PERSIST_STATE_UTILS_METHOD_NAME_USE_PERSIST_STATE_ADAPTER =
  "PersistStateUtils.usePersistStateAdapter";
/** @private Constant for logging the setState method in PersistStateUtils */
const PERSIST_STATE_UTILS_METHOD_NAME_SET_STATE = "PersistStateUtils.setState";
/** @private Constant for logging the getState method in PersistStateUtils */
const PERSIST_STATE_UTILS_METHOD_NAME_GET_STATE = "PersistStateUtils.getState";

// Logging method names for PersistMemoryUtils
/** @private Constant for logging the usePersistMemoryAdapter method in PersistMemoryUtils */
const PERSIST_MEMORY_UTILS_METHOD_NAME_USE_PERSIST_MEMORY_ADAPTER =
  "PersistMemoryUtils.usePersistMemoryAdapter";
/** @private Constant for logging the setMemory method in PersistMemoryUtils */
const PERSIST_MEMORY_UTILS_METHOD_NAME_SET_MEMORY =
  "PersistMemoryUtils.setMemory";
/** @private Constant for logging the getMemory method in PersistMemoryUtils */
const PERSIST_MEMORY_UTILS_METHOD_NAME_GET_MEMORY =
  "PersistMemoryUtils.getMemory";

// Logging method names for PersistStorageUtils
/** @private Constant for logging the usePersistStorageAdapter method in PersistStorageUtils */
const PERSIST_STORAGE_UTILS_METHOD_NAME_USE_PERSIST_STORAGE_ADAPTER =
  "PersistStorageUtils.usePersistStorageAdapter";
/** @private Constant for logging the getData method in PersistStorageUtils */
const PERSIST_STORAGE_UTILS_METHOD_NAME_GET_DATA =
  "PersistStorageUtils.getData";
/** @private Constant for logging the setData method in PersistStorageUtils */
const PERSIST_STORAGE_UTILS_METHOD_NAME_SET_DATA =
  "PersistStorageUtils.setData";

// Logging method names for private functions
/** @private Constant for logging the waitForInitFn function */
const BASE_WAIT_FOR_INIT_FN_METHOD_NAME = "PersistBase.waitForInitFn";
/** @private Constant for logging the createKeyFn function */
const LIST_CREATE_KEY_FN_METHOD_NAME = "PersistList.createKeyFn";
/** @private Constant for logging the popFn function */
const LIST_POP_FN_METHOD_NAME = "PersistList.popFn";
/** @private Constant for logging the getLastKeyFn function */
const LIST_GET_LAST_KEY_FN_METHOD_NAME = "PersistList.getLastKeyFn";

/** @private Count of retry attempts for unlink in waitForInit */
const BASE_UNLINK_RETRY_COUNT = 5;
/** @private Delay for retry attempts for unlink in waitForInit */
const BASE_UNLINK_RETRY_DELAY = 1_000;

/**
 * Interface defining methods for persistent storage operations.
 * @template Entity - The type of entity stored, defaults to IEntity.
 */
export interface IPersistBase<Entity extends IEntity = IEntity> {
  /**
   * Initializes the storage directory, creating it if needed and validating existing data by removing invalid entities.
   * @param initial - Indicates if this is the initial setup; affects memoization behavior in some implementations.
   * @returns A promise that resolves when initialization is complete.
   * @throws If directory creation or validation fails.
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Reads an entity from storage by its ID.
   * @param entityId - The identifier of the entity to read.
   * @returns A promise resolving to the entity data.
   * @throws If the entity is not found or reading/parsing fails.
   */
  readValue(entityId: EntityId): Promise<Entity>;

  /**
   * Checks if an entity exists in storage by its ID.
   * @param entityId - The identifier of the entity to check.
   * @returns A promise resolving to true if the entity exists, false otherwise.
   * @throws If checking existence fails for reasons other than the entity not existing.
   */
  hasValue(entityId: EntityId): Promise<boolean>;

  /**
   * Writes an entity to storage with the specified ID.
   * @param entityId - The identifier for the entity.
   * @param entity - The entity data to persist.
   * @returns A promise that resolves when the write operation is complete.
   * @throws If writing to the file system fails.
   */
  writeValue(entityId: EntityId, entity: Entity): Promise<void>;
}

/**
 * Constructor type for creating PersistBase instances, parameterized by entity name and entity type.
 * @template EntityName - The type of entity name, defaults to string.
 * @template Entity - The type of entity, defaults to IEntity.
 */
export type TPersistBaseCtor<
  EntityName extends string = string,
  Entity extends IEntity = IEntity
> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;

/**
 * Removes the file if invalid JSON found
 *
 * @private
 * @param self - The PersistBase instance being initialized.
 * @returns A promise that resolves when initialization is complete.
 */
const BASE_WAIT_FOR_INIT_UNLINK_FN = async (filePath: string) =>
  trycatch(
    retry(
      async () => {
        try {
          await fs.unlink(filePath);
          return true;
        } catch (error) {
          console.error(
            `agent-swarm PersistBase unlink failed for filePath=${filePath} error=${getErrorMessage(
              error
            )}`
          );
          throw error;
        }
      },
      BASE_UNLINK_RETRY_COUNT,
      BASE_UNLINK_RETRY_DELAY
    ),
    {
      defaultValue: false,
    }
  );

/**
 * Initializes the storage directory and validates existing entities, removing invalid ones.
 * Ensures the directory exists and cleans up corrupted files during initialization.
 * @private
 * @param self - The PersistBase instance being initialized.
 * @returns A promise that resolves when initialization is complete.
 * @throws If directory creation or file validation fails.
 */
const BASE_WAIT_FOR_INIT_FN = async (self: TPersistBase): Promise<void> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    swarm.loggerService.debug(BASE_WAIT_FOR_INIT_FN_METHOD_NAME, {
      entityName: self.entityName,
      directory: self._directory,
    });
  await fs.mkdir(self._directory, { recursive: true });
  for await (const key of self.keys()) {
    try {
      await self.readValue(key);
    } catch {
      const filePath = self._getFilePath(key);
      console.error(
        `agent-swarm PersistBase found invalid document for filePath=${filePath} entityName=${self.entityName}`
      );
      if (await not(BASE_WAIT_FOR_INIT_UNLINK_FN(filePath))) {
        console.error(
          `agent-swarm PersistBase failed to remove invalid document for filePath=${filePath} entityName=${self.entityName}`
        );
      }
    }
  }
};

/**
 * Generates a new unique key for a list item by incrementing the last used key.
 * Initializes the last count if not set by scanning existing keys.
 * @private
 * @param self - The PersistList instance generating the key.
 * @returns A promise resolving to the new key as a string.
 * @throws If key generation fails due to underlying storage issues.
 */
const LIST_CREATE_KEY_FN = async (self: TPersistList): Promise<string> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    swarm.loggerService.debug(LIST_CREATE_KEY_FN_METHOD_NAME, {
      entityName: self.entityName,
      lastCount: self._lastCount,
    });
  if (self._lastCount === null) {
    for await (const key of self.keys()) {
      const numericKey = Number(key);
      if (!isNaN(numericKey)) {
        self._lastCount = Math.max(numericKey, self._lastCount || 0);
      }
    }
  }
  if (self._lastCount === null) {
    self._lastCount = 0;
  }
  return String((self._lastCount += 1));
};

/**
 * Removes and returns the last item from the persistent list.
 * Uses the last key to fetch and delete the item atomically.
 * @private
 * @param self - The PersistList instance performing the pop operation.
 * @returns A promise resolving to the removed item or null if the list is empty.
 * @throws If reading or removing the item fails.
 */
const LIST_POP_FN = async (self: TPersistList): Promise<any | null> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    swarm.loggerService.debug(LIST_POP_FN_METHOD_NAME, {
      entityName: self.entityName,
    });
  const lastKey = await self[LIST_GET_LAST_KEY_SYMBOL]();
  if (lastKey === null) {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
      swarm.loggerService.debug(LIST_POP_FN_METHOD_NAME, {
        entityName: self.entityName,
        result: "No last key found, returning null",
      });
    return null;
  }
  const value = await self.readValue(lastKey);
  await self.removeValue(lastKey);
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    swarm.loggerService.debug(LIST_POP_FN_METHOD_NAME, {
      entityName: self.entityName,
      lastKey,
      value,
    });
  return value;
};

/**
 * Retrieves the key of the last item in the persistent list.
 * Scans all keys to determine the highest numeric value.
 * @private
 * @param self - The PersistList instance retrieving the key.
 * @returns A promise resolving to the last key or null if the list is empty.
 * @throws If key retrieval fails due to underlying storage issues.
 */
const LIST_GET_LAST_KEY_FN = async (
  self: TPersistList
): Promise<string | null> => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
    swarm.loggerService.debug(LIST_GET_LAST_KEY_FN_METHOD_NAME, {
      entityName: self.entityName,
    });
  let lastKey = 0;
  for await (const key of self.keys()) {
    const numericKey = Number(key);
    if (!isNaN(numericKey)) {
      lastKey = Math.max(numericKey, lastKey);
    }
  }
  if (lastKey === 0) {
    return null;
  }
  return String(lastKey);
};

/**
 * Base class for persistent storage of entities in the file system.
 * Provides methods for reading, writing, and managing entities as JSON files.
 * @template EntityName - The type of entity name, defaults to string.
 * @implements {IPersistBase}
 */
export const PersistBase = makeExtendable(
  class<EntityName extends string = string> implements IPersistBase {
    /** @private The directory path where entity files are stored */
    _directory: string;

    /**
     * Creates a new PersistBase instance for managing persistent storage of entities.
     * @param entityName - The name of the entity type, used as a subdirectory for storage.
     * @param baseDir - The base directory for storing entity files (defaults to "./logs/data").
     */
    constructor(
      readonly entityName: EntityName,
      readonly baseDir = join(process.cwd(), "logs/data")
    ) {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_CTOR, {
          entityName: this.entityName,
          baseDir,
        });
      this._directory = join(this.baseDir, this.entityName);
    }

    /**
     * Computes the file path for an entity based on its ID.
     * @private
     * @param entityId - The identifier of the entity.
     * @returns The full file path (e.g., `<baseDir>/<entityName>/<entityId>.json`).
     */
    _getFilePath(entityId: EntityId): string {
      return join(this.baseDir, this.entityName, `${entityId}.json`);
    }

    /**
     * Memoized initialization function ensuring it runs only once per instance.
     * @private
     * @returns A promise that resolves when initialization is complete.
     */
    [BASE_WAIT_FOR_INIT_SYMBOL] = singleshot(
      async (): Promise<void> => await BASE_WAIT_FOR_INIT_FN(this)
    );

    /**
     * Initializes the storage directory, creating it if it doesn’t exist and validating existing entities.
     * Invalid entities are removed during this process.
     * @param initial - Indicates if this is the initial setup; currently unused but reserved for future caching logic.
     * @returns A promise that resolves when initialization is complete.
     * @throws If directory creation or entity validation fails.
     */
    async waitForInit(initial: boolean): Promise<void> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT, {
          entityName: this.entityName,
          initial,
        });
      await this[BASE_WAIT_FOR_INIT_SYMBOL]();
    }

    /**
     * Retrieves the number of entities stored in the directory.
     * Counts only files with a `.json` extension.
     * @returns A promise resolving to the count of stored entities.
     * @throws If reading the directory fails.
     */
    async getCount(): Promise<number> {
      const files = await fs.readdir(this._directory);
      const { length } = files.filter((file) => file.endsWith(".json"));
      return length;
    }

    /**
     * Reads an entity from storage by its ID, parsing it from JSON.
     * @template T - The specific type of the entity, defaults to IEntity.
     * @param entityId - The identifier of the entity to read.
     * @returns A promise resolving to the parsed entity data.
     * @throws If the file is not found (`ENOENT`) or parsing fails.
     */
    async readValue<T extends IEntity = IEntity>(
      entityId: EntityId
    ): Promise<T> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_READ_VALUE, {
          entityName: this.entityName,
          entityId,
        });
      try {
        const filePath = this._getFilePath(entityId);
        const fileContent = await fs.readFile(filePath, "utf-8");
        return JSON.parse(fileContent) as T;
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          throw new Error(`Entity ${this.entityName}:${entityId} not found`);
        }
        throw new Error(
          `Failed to read entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Checks if an entity exists in storage by its ID.
     * @param entityId - The identifier of the entity to check.
     * @returns A promise resolving to true if the entity exists, false if not.
     * @throws If checking existence fails for reasons other than the file not existing.
     */
    async hasValue(entityId: EntityId): Promise<boolean> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_HAS_VALUE, {
          entityName: this.entityName,
          entityId,
        });
      try {
        const filePath = this._getFilePath(entityId);
        await fs.access(filePath);
        return true;
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          return false;
        }
        throw new Error(
          `Failed to check existence of entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Writes an entity to storage with the specified ID, serializing it to JSON.
     * Uses atomic file writing to ensure data integrity.
     * @template T - The specific type of the entity, defaults to IEntity.
     * @param entityId - The identifier for the entity.
     * @param entity - The entity data to persist.
     * @returns A promise that resolves when the write operation is complete.
     * @throws If writing to the file system fails.
     */
    async writeValue<T extends IEntity = IEntity>(
      entityId: EntityId,
      entity: T
    ): Promise<void> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_WRITE_VALUE, {
          entityName: this.entityName,
          entityId,
        });
      try {
        const filePath = this._getFilePath(entityId);
        const serializedData = JSON.stringify(entity);
        await writeFileAtomic(filePath, serializedData, "utf-8");
      } catch (error) {
        throw new Error(
          `Failed to write entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Removes an entity from storage by its ID.
     * @param entityId - The identifier of the entity to remove.
     * @returns A promise that resolves when the entity is deleted.
     * @throws If the entity is not found or deletion fails.
     */
    async removeValue(entityId: EntityId): Promise<void> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_REMOVE_VALUE, {
          entityName: this.entityName,
          entityId,
        });
      try {
        const filePath = this._getFilePath(entityId);
        await fs.unlink(filePath);
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          throw new Error(
            `Entity ${this.entityName}:${entityId} not found for deletion`
          );
        }
        throw new Error(
          `Failed to remove entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Removes all entities from storage under this entity name.
     * Deletes all `.json` files in the directory.
     * @returns A promise that resolves when all entities are removed.
     * @throws If reading the directory or deleting files fails.
     */
    async removeAll(): Promise<void> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_REMOVE_ALL, {
          entityName: this.entityName,
        });
      try {
        const files = await fs.readdir(this._directory);
        const entityFiles = files.filter((file) => file.endsWith(".json"));
        for (const file of entityFiles) {
          await fs.unlink(join(this._directory, file));
        }
      } catch (error) {
        throw new Error(
          `Failed to remove values for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Iterates over all entities in storage, sorted numerically by ID.
     * Yields entities in ascending order based on their IDs.
     * @template T - The specific type of the entities, defaults to IEntity.
     * @returns An async generator yielding each entity.
     * @throws If reading the directory or entity files fails.
     */
    async *values<T extends IEntity = IEntity>(): AsyncGenerator<T> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_VALUES, {
          entityName: this.entityName,
        });
      try {
        const files = await fs.readdir(this._directory);
        const entityIds = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -5))
          .sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        for (const entityId of entityIds) {
          const entity = await this.readValue<T>(entityId);
          yield entity;
        }
      } catch (error) {
        throw new Error(
          `Failed to read values for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Iterates over all entity IDs in storage, sorted numerically.
     * Yields IDs in ascending order.
     * @returns An async generator yielding each entity ID.
     * @throws If reading the directory fails.
     */
    async *keys(): AsyncGenerator<EntityId> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_KEYS, {
          entityName: this.entityName,
        });
      try {
        const files = await fs.readdir(this._directory);
        const entityIds = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -5))
          .sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        for (const entityId of entityIds) {
          yield entityId;
        }
      } catch (error) {
        throw new Error(
          `Failed to read keys for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Implements the async iterator protocol for iterating over entities.
     * Delegates to the `values` method for iteration.
     * @returns An async iterator yielding entities.
     */
    async *[Symbol.asyncIterator](): AsyncIterableIterator<any> {
      for await (const entity of this.values()) {
        yield entity;
      }
    }

    /**
     * Filters entities based on a predicate function.
     * Yields only entities that pass the predicate test.
     * @template T - The specific type of the entities, defaults to IEntity.
     * @param predicate - A function to test each entity.
     * @returns An async generator yielding filtered entities.
     * @throws If reading entities fails during iteration.
     */
    async *filter<T extends IEntity = IEntity>(
      predicate: (value: T) => boolean
    ): AsyncGenerator<T> {
      for await (const entity of this.values<T>()) {
        if (predicate(entity)) {
          yield entity;
        }
      }
    }

    /**
     * Takes a limited number of entities, optionally filtered by a predicate.
     * Stops yielding after reaching the specified total.
     * @template T - The specific type of the entities, defaults to IEntity.
     * @param total - The maximum number of entities to yield.
     * @param predicate - Optional function to filter entities before counting.
     * @returns An async generator yielding up to `total` entities.
     * @throws If reading entities fails during iteration.
     */
    async *take<T extends IEntity = IEntity>(
      total: number,
      predicate?: (value: T) => boolean
    ): AsyncGenerator<T> {
      let count = 0;
      if (predicate) {
        for await (const entity of this.values<T>()) {
          if (!predicate(entity)) {
            continue;
          }
          count += 1;
          yield entity;
          if (count >= total) {
            break;
          }
        }
      } else {
        for await (const entity of this.values<T>()) {
          count += 1;
          yield entity;
          if (count >= total) {
            break;
          }
        }
      }
    }
  }
);

/**
 * Type alias for an instance of PersistBase.
 */
export type TPersistBase = InstanceType<typeof PersistBase>;

/**
 * Extends PersistBase to provide a persistent list structure with push/pop operations.
 * Manages entities with numeric keys for ordered access.
 * @template EntityName - The type of entity name, defaults to string.
 * @extends {PersistBase<EntityName>}
 */
export const PersistList = makeExtendable(
  class<EntityName extends string = string> extends PersistBase<EntityName> {
    /** @private Tracks the last used numeric key for the list, null until initialized */
    _lastCount: number | null = null;

    /**
     * Creates a new PersistList instance for managing a persistent list of entities.
     * @param entityName - The name of the entity type, used as a subdirectory for storage.
     * @param baseDir - The base directory for storing list files; defaults to parent class if omitted.
     */
    constructor(entityName: EntityName, baseDir?: string) {
      super(entityName, baseDir);
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_LIST_METHOD_NAME_CTOR, {
          entityName: this.entityName,
          baseDir,
        });
    }

    /**
     * Queued function to create a new unique key for a list item.
     * Ensures sequential key generation even under concurrent calls.
     * @private
     * @returns A promise resolving to the new key as a string.
     * @throws If key generation fails due to underlying storage issues.
     */
    [LIST_CREATE_KEY_SYMBOL] = queued(
      async (): Promise<string> => await LIST_CREATE_KEY_FN(this)
    ) as () => Promise<string>;

    /**
     * Retrieves the key of the last item in the list.
     * @private
     * @returns A promise resolving to the last key or null if the list is empty.
     * @throws If key retrieval fails due to underlying storage issues.
     */
    [LIST_GET_LAST_KEY_SYMBOL] = async (): Promise<string | null> =>
      await LIST_GET_LAST_KEY_FN(this);

    /**
     * Queued function to remove and return the last item in the list.
     * Ensures atomic pop operations under concurrent calls.
     * @private
     * @template T - The specific type of the entity, defaults to IEntity.
     * @returns A promise resolving to the removed item or null if the list is empty.
     * @throws If reading or removing the item fails.
     */
    [LIST_POP_SYMBOL] = queued(
      async (): Promise<any | null> => await LIST_POP_FN(this)
    ) as <T extends IEntity = IEntity>() => Promise<T | null>;

    /**
     * Adds an entity to the end of the persistent list with a new unique numeric key.
     * @template T - The specific type of the entity, defaults to IEntity.
     * @param entity - The entity to append to the list.
     * @returns A promise that resolves when the entity is written.
     * @throws If writing to the file system fails.
     */
    async push<T extends IEntity = IEntity>(entity: T): Promise<void> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_LIST_METHOD_NAME_PUSH, {
          entityName: this.entityName,
        });
      return await this.writeValue(
        await this[LIST_CREATE_KEY_SYMBOL](),
        entity
      );
    }

    /**
     * Removes and returns the last entity from the persistent list.
     * @template T - The specific type of the entity, defaults to IEntity.
     * @returns A promise resolving to the removed entity or null if the list is empty.
     * @throws If reading or removing the entity fails.
     */
    async pop<T extends IEntity = IEntity>(): Promise<T | null> {
      GLOBAL_CONFIG.CC_LOGGER_ENABLE_DEBUG &&
        swarm.loggerService.debug(PERSIST_LIST_METHOD_NAME_POP, {
          entityName: this.entityName,
        });
      return await this[LIST_POP_SYMBOL]();
    }
  }
);

/**
 * Type alias for an instance of PersistList.
 */
export type TPersistList = InstanceType<typeof PersistList>;

/**
 * Interface for data stored in active agent persistence.
 */
export interface IPersistActiveAgentData {
  /** The name of the active agent */
  agentName: AgentName;
}

/**
 * Interface for data stored in navigation stack persistence.
 */
export interface IPersistNavigationStackData {
  /** The stack of agent names representing navigation history */
  agentStack: AgentName[];
}

/**
 * Interface defining control methods for swarm persistence operations.
 * Allows customization of persistence adapters for active agents and navigation stacks.
 */
export interface IPersistSwarmControl {
  /**
   * Sets a custom persistence adapter for active agent storage.
   * @param Ctor - The constructor for the active agent persistence adapter.
   */
  usePersistActiveAgentAdapter(
    Ctor: TPersistBaseCtor<SwarmName, IPersistActiveAgentData>
  ): void;

  /**
   * Sets a custom persistence adapter for navigation stack storage.
   * @param Ctor - The constructor for the navigation stack persistence adapter.
   */
  usePersistNavigationStackAdapter(
    Ctor: TPersistBaseCtor<SwarmName, IPersistNavigationStackData>
  ): void;
}

/**
 * Utility class for managing swarm-related persistence, including active agents and navigation stacks.
 * Provides methods to get/set active agents and navigation stacks per client and swarm.
 * @implements {IPersistSwarmControl}
 */
export class PersistSwarmUtils implements IPersistSwarmControl {
  /** @private Default constructor for active agent persistence, defaults to PersistBase */
  private PersistActiveAgentFactory: TPersistBaseCtor<
    SwarmName,
    IPersistActiveAgentData
  > = PersistBase;

  /** @private Default constructor for navigation stack persistence, defaults to PersistBase */
  private PersistNavigationStackFactory: TPersistBaseCtor<
    SwarmName,
    IPersistNavigationStackData
  > = PersistBase;

  /**
   * Memoized function to create or retrieve storage for active agents.
   * Ensures a single instance per swarm name.
   * @private
   * @param swarmName - The name of the swarm.
   * @returns A persistence instance for active agents.
   */
  private getActiveAgentStorage = memoize(
    ([swarmName]: [SwarmName]): string => `${swarmName}`,
    (swarmName: SwarmName): IPersistBase<IPersistActiveAgentData> =>
      Reflect.construct(this.PersistActiveAgentFactory, [
        swarmName,
        `./logs/data/_swarm_active_agent/`,
      ])
  );

  /**
   * Sets a custom constructor for active agent persistence, overriding the default PersistBase.
   * @param Ctor - The constructor to use for active agent storage.
   */
  public usePersistActiveAgentAdapter(
    Ctor: TPersistBaseCtor<SwarmName, IPersistActiveAgentData>
  ): void {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_USE_PERSIST_ACTIVE_AGENT_ADAPTER
      );
    this.PersistActiveAgentFactory = Ctor;
  }

  /**
   * Sets a custom constructor for navigation stack persistence, overriding the default PersistBase.
   * @param Ctor - The constructor to use for navigation stack storage.
   */
  public usePersistNavigationStackAdapter(
    Ctor: TPersistBaseCtor<SwarmName, IPersistNavigationStackData>
  ): void {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_USE_PERSIST_NAVIGATION_STACK_ADAPTER
      );
    this.PersistNavigationStackFactory = Ctor;
  }

  /**
   * Memoized function to create or retrieve storage for navigation stacks.
   * Ensures a single instance per swarm name.
   * @private
   * @param swarmName - The name of the swarm.
   * @returns A persistence instance for navigation stacks.
   */
  private getNavigationStackStorage = memoize(
    ([swarmName]: [SwarmName]): string => `${swarmName}`,
    (swarmName: SwarmName): IPersistBase<IPersistNavigationStackData> =>
      Reflect.construct(this.PersistNavigationStackFactory, [
        swarmName,
        `./logs/data/_swarm_navigation_stack/`,
      ])
  );

  /**
   * Retrieves the active agent for a client within a swarm, falling back to a default if not set.
   * @param clientId - The identifier of the client.
   * @param swarmName - The name of the swarm.
   * @param defaultAgent - The default agent name to return if no active agent is found.
   * @returns A promise resolving to the active agent’s name.
   * @throws If reading from storage fails.
   */
  public getActiveAgent = async (
    clientId: string,
    swarmName: SwarmName,
    defaultAgent: AgentName
  ): Promise<AgentName> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_GET_ACTIVE_AGENT,
        {
          clientId,
          swarmName,
        }
      );
    const isInitial = this.getActiveAgentStorage.has(swarmName);
    const activeAgentStorage = this.getActiveAgentStorage(swarmName);
    await activeAgentStorage.waitForInit(isInitial);
    if (await activeAgentStorage.hasValue(clientId)) {
      const { agentName } = await activeAgentStorage.readValue(clientId);
      return agentName;
    }
    return defaultAgent;
  };

  /**
   * Sets the active agent for a client within a swarm.
   * @param clientId - The identifier of the client.
   * @param agentName - The name of the agent to set as active.
   * @param swarmName - The name of the swarm.
   * @returns A promise that resolves when the active agent is persisted.
   * @throws If writing to storage fails.
   */
  public setActiveAgent = async (
    clientId: string,
    agentName: AgentName,
    swarmName: SwarmName
  ): Promise<void> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_SET_ACTIVE_AGENT,
        {
          clientId,
          agentName,
          swarmName,
        }
      );
    const isInitial = this.getActiveAgentStorage.has(swarmName);
    const activeAgentStorage = this.getActiveAgentStorage(swarmName);
    await activeAgentStorage.waitForInit(isInitial);
    await activeAgentStorage.writeValue(clientId, { agentName });
  };

  /**
   * Retrieves the navigation stack for a client within a swarm.
   * Returns an empty array if no stack is set.
   * @param clientId - The identifier of the client.
   * @param swarmName - The name of the swarm.
   * @returns A promise resolving to the navigation stack (array of agent names).
   * @throws If reading from storage fails.
   */
  public getNavigationStack = async (
    clientId: string,
    swarmName: SwarmName
  ): Promise<AgentName[]> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_GET_NAVIGATION_STACK,
        {
          clientId,
          swarmName,
        }
      );
    const isInitial = this.getNavigationStackStorage.has(swarmName);
    const navigationStackStorage = this.getNavigationStackStorage(swarmName);
    await navigationStackStorage.waitForInit(isInitial);
    if (await navigationStackStorage.hasValue(clientId)) {
      const { agentStack } = await navigationStackStorage.readValue(clientId);
      return agentStack;
    }
    return [];
  };

  /**
   * Sets the navigation stack for a client within a swarm.
   * @param clientId - The identifier of the client.
   * @param agentStack - The navigation stack (array of agent names) to persist.
   * @param swarmName - The name of the swarm.
   * @returns A promise that resolves when the navigation stack is persisted.
   * @throws If writing to storage fails.
   */
  public setNavigationStack = async (
    clientId: string,
    agentStack: AgentName[],
    swarmName: SwarmName
  ): Promise<void> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_SWARM_UTILS_METHOD_NAME_SET_NAVIGATION_STACK,
        {
          clientId,
          swarmName,
        }
      );
    const isInitial = this.getNavigationStackStorage.has(swarmName);
    const navigationStackStorage = this.getNavigationStackStorage(swarmName);
    await navigationStackStorage.waitForInit(isInitial);
    await navigationStackStorage.writeValue(clientId, { agentStack });
  };
}

/**
 * Singleton instance of PersistSwarmUtils for managing swarm persistence.
 * @type {PersistSwarmUtils}
 */
export const PersistSwarmAdapter = new PersistSwarmUtils();

/**
 * Exported singleton for swarm persistence operations, cast as the control interface.
 * Provides a global point of access for swarm persistence utilities.
 * @type {IPersistSwarmControl}
 */
export const PersistSwarm = PersistSwarmAdapter as IPersistSwarmControl;

/**
 * Interface for state data persistence.
 * Wraps state data for storage in a structured format.
 * @template T - The type of the state data, defaults to unknown.
 */
export interface IPersistStateData<T = unknown> {
  /** The state data to persist */
  state: T;
}

/**
 * Interface defining control methods for state persistence operations.
 * Allows customization of the persistence adapter for states.
 */
export interface IPersistStateControl {
  /**
   * Sets a custom persistence adapter for state storage.
   * @param Ctor - The constructor for the state persistence adapter.
   */
  usePersistStateAdapter(
    Ctor: TPersistBaseCtor<StorageName, IPersistStateData>
  ): void;
}

/**
 * Utility class for managing state persistence per client and state name.
 * Provides methods to get/set state data with a customizable persistence adapter.
 * @implements {IPersistStateControl}
 */
export class PersistStateUtils implements IPersistStateControl {
  /** @private Default constructor for state persistence, defaults to PersistBase */
  private PersistStateFactory: TPersistBaseCtor<StateName, IPersistStateData> =
    PersistBase;

  /**
   * Memoized function to create or retrieve storage for a specific state.
   * Ensures a single instance per state name.
   * @private
   * @param stateName - The name of the state.
   * @returns A persistence instance for the state.
   */
  private getStateStorage = memoize(
    ([stateName]: [StateName]): string => `${stateName}`,
    (stateName: StateName): IPersistBase<IPersistStateData> =>
      Reflect.construct(this.PersistStateFactory, [
        stateName,
        `./logs/data/state/`,
      ])
  );

  /**
   * Sets a custom constructor for state persistence, overriding the default PersistBase.
   * @param Ctor - The constructor to use for state storage.
   */
  public usePersistStateAdapter(
    Ctor: TPersistBaseCtor<StorageName, IPersistStateData>
  ): void {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_STATE_UTILS_METHOD_NAME_USE_PERSIST_STATE_ADAPTER
      );
    this.PersistStateFactory = Ctor;
  }

  /**
   * Sets the state for a client under a specific state name.
   * Persists the state data wrapped in an IPersistStateData structure.
   * @template T - The specific type of the state data, defaults to unknown.
   * @param state - The state data to persist.
   * @param clientId - The identifier of the client.
   * @param stateName - The name of the state.
   * @returns A promise that resolves when the state is persisted.
   * @throws If writing to storage fails.
   */
  public setState = async <T = unknown>(
    state: T,
    clientId: string,
    stateName: StateName
  ): Promise<void> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_STATE_UTILS_METHOD_NAME_SET_STATE, {
        clientId,
        stateName,
      });
    const isInitial = this.getStateStorage.has(stateName);
    const stateStorage = this.getStateStorage(stateName);
    await stateStorage.waitForInit(isInitial);
    await stateStorage.writeValue(clientId, { state });
  };

  /**
   * Retrieves the state for a client under a specific state name, falling back to a default if not set.
   * @template T - The specific type of the state data, defaults to unknown.
   * @param clientId - The identifier of the client.
   * @param stateName - The name of the state.
   * @param defaultState - The default state to return if no state is found.
   * @returns A promise resolving to the state data.
   * @throws If reading from storage fails.
   */
  public getState = async <T = unknown>(
    clientId: string,
    stateName: StateName,
    defaultState: T
  ): Promise<T> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_STATE_UTILS_METHOD_NAME_GET_STATE, {
        clientId,
        stateName,
      });
    const isInitial = this.getStateStorage.has(stateName);
    const stateStorage = this.getStateStorage(stateName);
    await stateStorage.waitForInit(isInitial);
    if (await stateStorage.hasValue(clientId)) {
      const { state } = await stateStorage.readValue(clientId);
      return state as T;
    }
    return defaultState;
  };
}

/**
 * Singleton instance of PersistStateUtils for managing state persistence.
 * @type {PersistStateUtils}
 */
export const PersistStateAdapter = new PersistStateUtils();

/**
 * Exported singleton for state persistence operations, cast as the control interface.
 * Provides a global point of access for state persistence utilities.
 * @type {IPersistStateControl}
 */
export const PersistState = PersistStateAdapter as IPersistStateControl;

/**
 * Interface for storage data persistence.
 * Wraps an array of storage data for persistence.
 * @template T - The type of storage data, defaults to IStorageData.
 */
export interface IPersistStorageData<T extends IStorageData = IStorageData> {
  /** The array of storage data to persist */
  data: T[];
}

/**
 * Interface defining control methods for storage persistence operations.
 * Allows customization of the persistence adapter for storage.
 */
export interface IPersistStorageControl {
  /**
   * Sets a custom persistence adapter for storage.
   * @param Ctor - The constructor for the storage persistence adapter.
   */
  usePersistStorageAdapter(
    Ctor: TPersistBaseCtor<StorageName, IPersistStorageData>
  ): void;
}

/**
 * Utility class for managing storage persistence per client and storage name.
 * Provides methods to get/set storage data with a customizable persistence adapter.
 * @implements {IPersistStorageControl}
 */
export class PersistStorageUtils implements IPersistStorageControl {
  /** @private Default constructor for storage persistence, defaults to PersistBase */
  private PersistStorageFactory: TPersistBaseCtor<
    StorageName,
    IPersistStorageData
  > = PersistBase;

  /**
   * Memoized function to create or retrieve storage for a specific storage name.
   * Ensures a single instance per storage name.
   * @private
   * @param storageName - The name of the storage.
   * @returns A persistence instance for the storage.
   */
  private getPersistStorage = memoize(
    ([storageName]: [StorageName]): string => `${storageName}`,
    (storageName: StorageName): IPersistBase<IPersistStorageData> =>
      Reflect.construct(this.PersistStorageFactory, [
        storageName,
        `./logs/data/storage/`,
      ])
  );

  /**
   * Sets a custom constructor for storage persistence, overriding the default PersistBase.
   * @param Ctor - The constructor to use for storage.
   */
  public usePersistStorageAdapter(
    Ctor: TPersistBaseCtor<StorageName, IPersistStorageData>
  ): void {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_STORAGE_UTILS_METHOD_NAME_USE_PERSIST_STORAGE_ADAPTER
      );
    this.PersistStorageFactory = Ctor;
  }

  /**
   * Retrieves the data for a client from a specific storage, falling back to a default if not set.
   * @template T - The specific type of the storage data, defaults to IStorageData.
   * @param clientId - The identifier of the client.
   * @param storageName - The name of the storage.
   * @param defaultValue - The default value to return if no data is found.
   * @returns A promise resolving to the storage data array.
   * @throws If reading from storage fails.
   */
  public getData = async <T extends IStorageData = IStorageData>(
    clientId: string,
    storageName: StorageName,
    defaultValue: T[]
  ): Promise<T[]> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_STORAGE_UTILS_METHOD_NAME_GET_DATA, {
        clientId,
        storageName,
      });
    const isInitial = this.getPersistStorage.has(storageName);
    const persistStorage = this.getPersistStorage(storageName);
    await persistStorage.waitForInit(isInitial);
    if (await persistStorage.hasValue(clientId)) {
      const { data } = await persistStorage.readValue(clientId);
      return data as T[];
    }
    return defaultValue;
  };

  /**
   * Sets the data for a client in a specific storage.
   * Persists the data wrapped in an IPersistStorageData structure.
   * @template T - The specific type of the storage data, defaults to IStorageData.
   * @param data - The array of data to persist.
   * @param clientId - The identifier of the client.
   * @param storageName - The name of the storage.
   * @returns A promise that resolves when the data is persisted.
   * @throws If writing to storage fails.
   */
  public setData = async <T extends IStorageData = IStorageData>(
    data: T[],
    clientId: string,
    storageName: StorageName
  ): Promise<void> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_STORAGE_UTILS_METHOD_NAME_SET_DATA, {
        clientId,
        storageName,
      });
    const isInitial = this.getPersistStorage.has(storageName);
    const persistStorage = this.getPersistStorage(storageName);
    await persistStorage.waitForInit(isInitial);
    await persistStorage.writeValue(clientId, { data });
  };
}

/**
 * Singleton instance of PersistStorageUtils for managing storage persistence.
 * @type {PersistStorageUtils}
 */
export const PersistStorageAdapter = new PersistStorageUtils();

/**
 * Exported singleton for storage persistence operations, cast as the control interface.
 * Provides a global point of access for storage persistence utilities.
 * @type {IPersistStorageControl}
 */
export const PersistStorage = PersistStorageAdapter as IPersistStorageControl;

/**
 * Interface for memory data persistence.
 * Wraps memory data for storage in a structured format.
 * @template T - The type of the memory data, defaults to unknown.
 */
export interface IPersistMemoryData<T = unknown> {
  /** The memory data to persist */
  data: T;
}

/**
 * Interface defining control methods for memory persistence operations.
 * Allows customization of the persistence adapter for memory.
 */
export interface IPersistMemoryControl {
  /**
   * Sets a custom persistence adapter for memory storage.
   * @param Ctor - The constructor for the memory persistence adapter.
   */
  usePersistMemoryAdapter(
    Ctor: TPersistBaseCtor<StorageName, IPersistMemoryData>
  ): void;
}

/**
 * Utility class for managing memory persistence per client.
 * Provides methods to get/set memory data with a customizable persistence adapter.
 * @implements {IPersistMemoryControl}
 */
export class PersistMemoryUtils implements IPersistMemoryControl {
  /** @private Default constructor for memory persistence, defaults to PersistBase */
  private PersistMemoryFactory: TPersistBaseCtor<
    SessionId,
    IPersistMemoryData
  > = PersistBase;

  /**
   * Memoized function to create or retrieve storage for a specific client’s memory.
   * Ensures a single instance per client ID.
   * @private
   * @param clientId - The identifier of the client (session ID).
   * @returns A persistence instance for the memory.
   */
  private getMemoryStorage = memoize(
    ([clientId]: [SessionId]): string => `${clientId}`,
    (clientId: SessionId): IPersistBase<IPersistMemoryData> =>
      Reflect.construct(this.PersistMemoryFactory, [
        clientId,
        `./logs/data/memory/`,
      ])
  );

  /**
   * Sets a custom constructor for memory persistence, overriding the default PersistBase.
   * @param Ctor - The constructor to use for memory storage.
   */
  public usePersistMemoryAdapter(
    Ctor: TPersistBaseCtor<SessionId, IPersistMemoryData>
  ): void {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(
        PERSIST_MEMORY_UTILS_METHOD_NAME_USE_PERSIST_MEMORY_ADAPTER
      );
    this.PersistMemoryFactory = Ctor;
  }

  /**
   * Sets the memory data for a client.
   * Persists the data wrapped in an IPersistMemoryData structure.
   * @template T - The specific type of the memory data, defaults to unknown.
   * @param data - The memory data to persist.
   * @param clientId - The identifier of the client (session ID).
   * @returns A promise that resolves when the memory is persisted.
   * @throws If writing to storage fails.
   */
  public setMemory = async <T = unknown>(
    data: T,
    clientId: string
  ): Promise<void> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_MEMORY_UTILS_METHOD_NAME_SET_MEMORY, {
        clientId,
      });
    const isInitial = this.getMemoryStorage.has(clientId);
    const stateStorage = this.getMemoryStorage(clientId);
    await stateStorage.waitForInit(isInitial);
    await stateStorage.writeValue(clientId, { data });
  };

  /**
   * Retrieves the memory data for a client, falling back to a default if not set.
   * @template T - The specific type of the memory data, defaults to unknown.
   * @param clientId - The identifier of the client (session ID).
   * @param defaultState - The default memory data to return if none is found.
   * @returns A promise resolving to the memory data.
   * @throws If reading from storage fails.
   */
  public getMemory = async <T = unknown>(
    clientId: string,
    defaultState: T
  ): Promise<T> => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(PERSIST_MEMORY_UTILS_METHOD_NAME_GET_MEMORY, {
        clientId,
      });
    const isInitial = this.getMemoryStorage.has(clientId);
    const stateStorage = this.getMemoryStorage(clientId);
    await stateStorage.waitForInit(isInitial);
    if (await stateStorage.hasValue(clientId)) {
      const { data } = await stateStorage.readValue(clientId);
      return data as T;
    }
    return defaultState;
  };

  /**
   * Disposes of the memory storage for a client by clearing its memoized instance.
   * @param clientId - The identifier of the client (session ID).
   */
  public dispose(clientId: string) {
    this.getMemoryStorage.clear(clientId);
  }
}

/**
 * Singleton instance of PersistMemoryUtils for managing memory persistence.
 * @type {PersistMemoryUtils}
 */
export const PersistMemoryAdapter = new PersistMemoryUtils();

/**
 * Exported singleton for memory persistence operations, cast as the control interface.
 * Provides a global point of access for memory persistence utilities.
 * @type {IPersistMemoryControl}
 */
export const PersistMemory = PersistMemoryAdapter as IPersistMemoryControl;
