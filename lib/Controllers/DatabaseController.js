"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


const transformObjectACL = (_ref) => {
  let {
    ACL
  } = _ref,
      result = _objectWithoutProperties(_ref, ["ACL"]);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }

    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }

  return result;
};

const specialQuerykeys = ['$and', '$or', '$nor', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = query => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);
      /* In MongoDB 3.2 & 3.4, $or queries which are not alone at the top
       * level of the query can not make efficient use of indexes due to a
       * long standing bug known as SERVER-13732.
       *
       * This bug was fixed in MongoDB version 3.6.
       *
       * For versions pre-3.6, the below logic produces a substantial
       * performance improvement inside the database by avoiding the bug.
       *
       * For versions 3.6 and above, there is no performance improvement and
       * the logic is unnecessary. Some query patterns are even slowed by
       * the below logic, due to the bug having been fixed and better
       * query plans being chosen.
       *
       * When versions before 3.4 are no longer supported by this project,
       * this logic, and the accompanying `skipMongoDBServer13732Workaround`
       * flag, can be removed.
       *
       * This block restructures queries in which $or is not the sole top
       * level element by moving all other top-level predicates inside every
       * subdocument of the $or predicate, allowing MongoDB's query planner
       * to make full use of the most relevant indexes.
       *
       * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
       * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
       *
       * The only exceptions are $near and $nearSphere operators, which are
       * constrained to only 1 operator per query. As a result, these ops
       * remain at the top level
       *
       * https://jira.mongodb.org/browse/SERVER-13732
       * https://github.com/parse-community/parse-server/issues/3767
       */

      Object.keys(query).forEach(key => {
        const noCollisions = !query.$or.some(subq => Object.prototype.hasOwnProperty.call(subq, key));
        let hasNears = false;

        if (query[key] != null && typeof query[key] == 'object') {
          hasNears = '$near' in query[key] || '$nearSphere' in query[key];
        }

        if (key != '$or' && noCollisions && !hasNears) {
          query.$or.forEach(subquery => {
            subquery[key] = query[key];
          });
          delete query[key];
        }
      });
      query.$or.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }

    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

  const perms = schema.getClassLevelPermissions(className);

  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;

    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false; // check if the object grants the current user access based on the extracted fields

      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];

        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }

        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      }); // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C

      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      } // intersect all sets of protectedFields


      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }

  const isUserClass = className === '_User';
  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */

  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]); // fields not requested by client (excluded),
    //but were needed to apply protecttedFields

    perms.protectedFields && perms.protectedFields.temporaryKeys && perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }

  if (!isUserClass) {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;
  delete object.sessionToken;

  if (isMaster) {
    return object;
  }

  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;
  delete object._password_history;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }

  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function expandResultOnKeyPath(object, key, value) {
  if (key.indexOf('.') < 0) {
    object[key] = value[key];
    return object;
  }

  const path = key.split('.');
  const firstKey = path[0];
  const nextPath = path.slice(1).join('.');
  object[firstKey] = expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
  delete object[key];
  return object;
}

function sanitizeDatabaseResult(originalObject, result) {
  const response = {};

  if (!result) {
    return Promise.resolve(response);
  }

  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key]; // determine if that was an op

    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      // the op may have happend on a keypath
      expandResultOnKeyPath(response, key, result);
    }
  });
  return Promise.resolve(response);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].amount;
          break;

        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = [];
          break;

        case 'Delete':
          delete object[key];
          break;

        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;

      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
}; // Transforms a Database format ACL to a REST API format ACL


const untransformObjectACL = (_ref2) => {
  let {
    _rperm,
    _wperm
  } = _ref2,
      output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }

  return output;
};
/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */


const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};

class DatabaseController {
  constructor(adapter, schemaCache) {
    this.adapter = adapter;
    this.schemaCache = schemaCache; // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.

    this.schemaPromise = null;
    this._transactionalSession = null;
  }

  collectionExists(className) {
    return this.adapter.classExists(className);
  }

  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }

    return Promise.resolve();
  } // Returns a promise for a schemaController.


  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }

    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  } // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface


  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);

      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }

      return className;
    });
  } // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.


  validateObject(className, object, query, runOptions) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);

        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);

          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
        }

        if (!query) {
          return Promise.resolve();
        }

        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }

            const rootFieldName = getRootFieldName(fieldName);

            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });

          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }

          update = transformObjectACL(update);
          transformAuthData(className, update, schema);

          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }

              return {};
            });
          }

          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (validateOnly) {
          return result;
        }

        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }

        return sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  } // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.


  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }

    for (const key of deleteMe) {
      delete update[key];
    }

    return ops;
  } // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed


  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  } // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.


  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }

      throw error;
    });
  } // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.


  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);

          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        } // delete by query


        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }

          throw error;
        });
      });
    });
  } // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.


  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);

        if (validateOnly) {
          return {};
        }

        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }

        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }

  canAddField(schema, className, object, aclGroup, runOptions) {
    const classSchema = schema.schemaData[className];

    if (!classSchema) {
      return Promise.resolve();
    }

    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }

      return schemaFields.indexOf(field) < 0;
    });

    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }

    return Promise.resolve();
  } // Won't delete collections in the system namespace

  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */


  deleteEverything(fast = false) {
    this.schemaPromise = null;
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
  } // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.


  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};

    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }

    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated


  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);

      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }

      let queries = null;

      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;

          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }

          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
      // $in / $nin

      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }

        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }

          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  } // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated


  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    var relatedTo = query['$relatedTo'];

    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }

  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$in'] = idsIntersection;
    return query;
  }

  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  } // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  caseInsensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.


  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    hint,
    caseInsensitive = false,
    explain
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }

        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }

        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }

        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          hint,
          caseInsensitive,
          explain
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }

          const rootFieldName = getRootFieldName(fieldName);

          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;

          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
              based on pointer-permissions are determined after querying. The filtering can
              overwrite the protected fields. */

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
          }

          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }

          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }

          validateQuery(query);

          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }

  deleteSchema(className) {
    return this.loadSchema({
      clearCache: true
    }).then(schemaController => schemaController.getOneSchema(className, true)).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }

        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            return;
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  } // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json


  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  } // Naive logic reducer for OR operations meant to be used only for pointer permissions.


  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }

    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$or.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
      delete query.$or;
    }

    return query;
  } // Naive logic reducer for AND operations meant to be used only for pointer permissions.


  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }

    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$and.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
      delete query.$and;
    }

    return query;
  } // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)


  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];

    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }

    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    } // the ACL should have exactly 1 user


    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }

      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;

        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        } // if we already have a constraint on the key, use the $and


        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        } // otherwise just add the constaint


        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
    } else {
      return query;
    }
  }

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null; // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'

    const preserveKeys = queryOptions.keys; // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)

    const serverOnlyKeys = [];
    const authenticated = auth.user; // map to allow check without array search

    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {}); // array of sets of protected fields. separate item for each applicable criteria

    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);

          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName); // 2. preserve it delete later

            serverOnlyKeys.push(fieldName);
          }
        }

        continue;
      } // add public tier


      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }

      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }

        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    } // check if there's a rule for current user's id


    if (authenticated) {
      const userId = auth.user.id;

      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    } // preserve fields to be removed before sending response to client


    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }

      return acc;
    }, []); // intersect all sets of protectedFields

    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }

  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }

  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }

    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }

    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.


  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    const idempotencyClassPromise = this.adapter instanceof _MongoStorageAdapter.default ? this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency')) : Promise.resolve();
    const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    const usernameCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const emailCaseInsensitiveIndex = userClassPromise.then(() => this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true)).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

      throw error;
    });
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    const idempotencyRequestIdIndex = this.adapter instanceof _MongoStorageAdapter.default ? idempotencyClassPromise.then(() => this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);

      throw error;
    }) : Promise.resolve();
    const idempotencyExpireIndex = this.adapter instanceof _MongoStorageAdapter.default ? idempotencyClassPromise.then(() => this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, {
      ttl: 0
    })).catch(error => {
      _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);

      throw error;
    }) : Promise.resolve();
    const indexPromise = this.adapter.updateSchemaWithIndexes(); // Create tables for volatile classes

    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    return Promise.all([usernameUniqueness, usernameCaseInsensitiveIndex, emailUniqueness, emailCaseInsensitiveIndex, roleUniqueness, idempotencyRequestIdIndex, idempotencyExpireIndex, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwiT2JqZWN0Iiwia2V5cyIsIm5vQ29sbGlzaW9ucyIsInNvbWUiLCJzdWJxIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaGFzTmVhcnMiLCJzdWJxdWVyeSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImF1dGgiLCJvcGVyYXRpb24iLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJwcm90ZWN0ZWRGaWVsZHMiLCJvYmplY3QiLCJ1c2VySWQiLCJ1c2VyIiwiaWQiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzUmVhZE9wZXJhdGlvbiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsInZhbHVlIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsIm9iamVjdElkIiwiZmllbGRzIiwidiIsImluY2x1ZGVzIiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5IiwiZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwicGF0aCIsInNwbGl0IiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwiam9pbiIsInNhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcmlnaW5hbE9iamVjdCIsInJlc3BvbnNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJrZXlVcGRhdGUiLCJfX29wIiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwicmVsYXRpb25TY2hlbWEiLCJyZWxhdGVkSWQiLCJvd25pbmdJZCIsIkRhdGFiYXNlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsInNjaGVtYUNhY2hlIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIm9wdGlvbnMiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwidXBkYXRlIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJyZWxhdGlvblVwZGF0ZXMiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjb2xsZWN0UmVsYXRpb25VcGRhdGVzIiwiYWRkUG9pbnRlclBlcm1pc3Npb25zIiwiY2F0Y2giLCJlcnJvciIsInJvb3RGaWVsZE5hbWUiLCJmaWVsZE5hbWVJc1ZhbGlkIiwidXBkYXRlT3BlcmF0aW9uIiwiaW5uZXJLZXkiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiZGVsZXRlQWxsQ2xhc3NlcyIsImNsZWFyIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5IiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJpIiwiaiIsInNob3J0ZXIiLCJsb25nZXIiLCJmb3VuZEVudHJpZXMiLCJhY2MiLCJzaG9ydGVyRW50cmllcyIsInNwbGljZSIsInJlZHVjZUFuZE9wZXJhdGlvbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsInVzZXJBQ0wiLCJncm91cEtleSIsInBlcm1GaWVsZHMiLCJwb2ludGVyRmllbGRzIiwidXNlclBvaW50ZXIiLCJmaWVsZERlc2NyaXB0b3IiLCJmaWVsZFR5cGUiLCJxdWVyeUNsYXVzZSIsIiRhbGwiLCJhc3NpZ24iLCJwcmVzZXJ2ZUtleXMiLCJzZXJ2ZXJPbmx5S2V5cyIsImF1dGhlbnRpY2F0ZWQiLCJyb2xlcyIsInVzZXJSb2xlcyIsInByb3RlY3RlZEtleXNTZXRzIiwicHJvdGVjdGVkS2V5cyIsIm5leHQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwidXNlckNsYXNzUHJvbWlzZSIsInJvbGVDbGFzc1Byb21pc2UiLCJpZGVtcG90ZW5jeUNsYXNzUHJvbWlzZSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJ1c2VybmFtZVVuaXF1ZW5lc3MiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsInVzZXJuYW1lQ2FzZUluc2Vuc2l0aXZlSW5kZXgiLCJlbnN1cmVJbmRleCIsImVtYWlsVW5pcXVlbmVzcyIsImVtYWlsQ2FzZUluc2Vuc2l0aXZlSW5kZXgiLCJyb2xlVW5pcXVlbmVzcyIsImlkZW1wb3RlbmN5UmVxdWVzdElkSW5kZXgiLCJpZGVtcG90ZW5jeUV4cGlyZUluZGV4IiwidHRsIiwiaW5kZXhQcm9taXNlIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJhZGFwdGVySW5pdCIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJtb2R1bGUiLCJleHBvcnRzIiwiX3ZhbGlkYXRlUXVlcnkiXSwibWFwcGluZ3MiOiI7O0FBS0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBNlFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUExUUEsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0FBQy9CLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQrQixDQUUvQjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ0csTUFBVCxHQUFrQjtBQUFFQyxJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBR0wsR0FBVjtBQUFQLEdBQWxCO0FBQ0EsU0FBT0MsUUFBUDtBQUNEOztBQUVELFNBQVNLLFVBQVQsQ0FBb0JQLEtBQXBCLEVBQTJCQyxHQUEzQixFQUFnQztBQUM5QixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEOEIsQ0FFOUI7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNNLE1BQVQsR0FBa0I7QUFBRUYsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQVAsRUFBWSxHQUFHTCxHQUFmO0FBQVAsR0FBbEI7QUFD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LEdBQVIsQ0FBWSxDQUNqQnVJLGtCQURpQixFQUVqQkksNEJBRmlCLEVBR2pCRSxlQUhpQixFQUlqQkMseUJBSmlCLEVBS2pCQyxjQUxpQixFQU1qQkMseUJBTmlCLEVBT2pCQyxzQkFQaUIsRUFRakJJLFdBUmlCLEVBU2pCRixZQVRpQixDQUFaLENBQVA7QUFXRDs7QUF4M0NzQjs7QUE2M0N6QkksTUFBTSxDQUFDQyxPQUFQLEdBQWlCMU4sa0JBQWpCLEMsQ0FDQTs7QUFDQXlOLE1BQU0sQ0FBQ0MsT0FBUCxDQUFlQyxjQUFmLEdBQWdDblUsYUFBaEMiLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0ICogYXMgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsUXVlcnlrZXlzLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChxdWVyeTogYW55KTogdm9pZCA9PiB7XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcblxuICAgICAgLyogSW4gTW9uZ29EQiAzLjIgJiAzLjQsICRvciBxdWVyaWVzIHdoaWNoIGFyZSBub3QgYWxvbmUgYXQgdGhlIHRvcFxuICAgICAgICogbGV2ZWwgb2YgdGhlIHF1ZXJ5IGNhbiBub3QgbWFrZSBlZmZpY2llbnQgdXNlIG9mIGluZGV4ZXMgZHVlIHRvIGFcbiAgICAgICAqIGxvbmcgc3RhbmRpbmcgYnVnIGtub3duIGFzIFNFUlZFUi0xMzczMi5cbiAgICAgICAqXG4gICAgICAgKiBUaGlzIGJ1ZyB3YXMgZml4ZWQgaW4gTW9uZ29EQiB2ZXJzaW9uIDMuNi5cbiAgICAgICAqXG4gICAgICAgKiBGb3IgdmVyc2lvbnMgcHJlLTMuNiwgdGhlIGJlbG93IGxvZ2ljIHByb2R1Y2VzIGEgc3Vic3RhbnRpYWxcbiAgICAgICAqIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50IGluc2lkZSB0aGUgZGF0YWJhc2UgYnkgYXZvaWRpbmcgdGhlIGJ1Zy5cbiAgICAgICAqXG4gICAgICAgKiBGb3IgdmVyc2lvbnMgMy42IGFuZCBhYm92ZSwgdGhlcmUgaXMgbm8gcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnQgYW5kXG4gICAgICAgKiB0aGUgbG9naWMgaXMgdW5uZWNlc3NhcnkuIFNvbWUgcXVlcnkgcGF0dGVybnMgYXJlIGV2ZW4gc2xvd2VkIGJ5XG4gICAgICAgKiB0aGUgYmVsb3cgbG9naWMsIGR1ZSB0byB0aGUgYnVnIGhhdmluZyBiZWVuIGZpeGVkIGFuZCBiZXR0ZXJcbiAgICAgICAqIHF1ZXJ5IHBsYW5zIGJlaW5nIGNob3Nlbi5cbiAgICAgICAqXG4gICAgICAgKiBXaGVuIHZlcnNpb25zIGJlZm9yZSAzLjQgYXJlIG5vIGxvbmdlciBzdXBwb3J0ZWQgYnkgdGhpcyBwcm9qZWN0LFxuICAgICAgICogdGhpcyBsb2dpYywgYW5kIHRoZSBhY2NvbXBhbnlpbmcgYHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kYFxuICAgICAgICogZmxhZywgY2FuIGJlIHJlbW92ZWQuXG4gICAgICAgKlxuICAgICAgICogVGhpcyBibG9jayByZXN0cnVjdHVyZXMgcXVlcmllcyBpbiB3aGljaCAkb3IgaXMgbm90IHRoZSBzb2xlIHRvcFxuICAgICAgICogbGV2ZWwgZWxlbWVudCBieSBtb3ZpbmcgYWxsIG90aGVyIHRvcC1sZXZlbCBwcmVkaWNhdGVzIGluc2lkZSBldmVyeVxuICAgICAgICogc3ViZG9jdW1lbnQgb2YgdGhlICRvciBwcmVkaWNhdGUsIGFsbG93aW5nIE1vbmdvREIncyBxdWVyeSBwbGFubmVyXG4gICAgICAgKiB0byBtYWtlIGZ1bGwgdXNlIG9mIHRoZSBtb3N0IHJlbGV2YW50IGluZGV4ZXMuXG4gICAgICAgKlxuICAgICAgICogRUc6ICAgICAgeyRvcjogW3thOiAxfSwge2E6IDJ9XSwgYjogMn1cbiAgICAgICAqIEJlY29tZXM6IHskb3I6IFt7YTogMSwgYjogMn0sIHthOiAyLCBiOiAyfV19XG4gICAgICAgKlxuICAgICAgICogVGhlIG9ubHkgZXhjZXB0aW9ucyBhcmUgJG5lYXIgYW5kICRuZWFyU3BoZXJlIG9wZXJhdG9ycywgd2hpY2ggYXJlXG4gICAgICAgKiBjb25zdHJhaW5lZCB0byBvbmx5IDEgb3BlcmF0b3IgcGVyIHF1ZXJ5LiBBcyBhIHJlc3VsdCwgdGhlc2Ugb3BzXG4gICAgICAgKiByZW1haW4gYXQgdGhlIHRvcCBsZXZlbFxuICAgICAgICpcbiAgICAgICAqIGh0dHBzOi8vamlyYS5tb25nb2RiLm9yZy9icm93c2UvU0VSVkVSLTEzNzMyXG4gICAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzc2N1xuICAgICAgICovXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICBjb25zdCBub0NvbGxpc2lvbnMgPSAhcXVlcnkuJG9yLnNvbWUoc3VicSA9PlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdWJxLCBrZXkpXG4gICAgICAgICk7XG4gICAgICAgIGxldCBoYXNOZWFycyA9IGZhbHNlO1xuICAgICAgICBpZiAocXVlcnlba2V5XSAhPSBudWxsICYmIHR5cGVvZiBxdWVyeVtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgICAgaGFzTmVhcnMgPSAnJG5lYXInIGluIHF1ZXJ5W2tleV0gfHwgJyRuZWFyU3BoZXJlJyBpbiBxdWVyeVtrZXldO1xuICAgICAgICB9XG4gICAgICAgIGlmIChrZXkgIT0gJyRvcicgJiYgbm9Db2xsaXNpb25zICYmICFoYXNOZWFycykge1xuICAgICAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHN1YnF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHN1YnF1ZXJ5W2tleV0gPSBxdWVyeVtrZXldO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJG5vcikge1xuICAgIGlmIChxdWVyeS4kbm9yIGluc3RhbmNlb2YgQXJyYXkgJiYgcXVlcnkuJG5vci5sZW5ndGggPiAwKSB7XG4gICAgICBxdWVyeS4kbm9yLmZvckVhY2godmFsaWRhdGVRdWVyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBrZXkgbmFtZTogJHtrZXl9YCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXI6IGJvb2xlYW4sXG4gIGFjbEdyb3VwOiBhbnlbXSxcbiAgYXV0aDogYW55LFxuICBvcGVyYXRpb246IGFueSxcbiAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gIGNsYXNzTmFtZTogc3RyaW5nLFxuICBwcm90ZWN0ZWRGaWVsZHM6IG51bGwgfCBBcnJheTxhbnk+LFxuICBvYmplY3Q6IGFueVxuKSA9PiB7XG4gIGxldCB1c2VySWQgPSBudWxsO1xuICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHVzZXJJZCA9IGF1dGgudXNlci5pZDtcblxuICAvLyByZXBsYWNlIHByb3RlY3RlZEZpZWxkcyB3aGVuIHVzaW5nIHBvaW50ZXItcGVybWlzc2lvbnNcbiAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gIGlmIChwZXJtcykge1xuICAgIGNvbnN0IGlzUmVhZE9wZXJhdGlvbiA9IFsnZ2V0JywgJ2ZpbmQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMTtcblxuICAgIGlmIChpc1JlYWRPcGVyYXRpb24gJiYgcGVybXMucHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBleHRyYWN0IHByb3RlY3RlZEZpZWxkcyBhZGRlZCB3aXRoIHRoZSBwb2ludGVyLXBlcm1pc3Npb24gcHJlZml4XG4gICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybSA9IE9iamVjdC5rZXlzKHBlcm1zLnByb3RlY3RlZEZpZWxkcylcbiAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSlcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIHJldHVybiB7IGtleToga2V5LnN1YnN0cmluZygxMCksIHZhbHVlOiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB9O1xuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbmV3UHJvdGVjdGVkRmllbGRzOiBBcnJheTxzdHJpbmc+W10gPSBbXTtcbiAgICAgIGxldCBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IGZhbHNlO1xuXG4gICAgICAvLyBjaGVjayBpZiB0aGUgb2JqZWN0IGdyYW50cyB0aGUgY3VycmVudCB1c2VyIGFjY2VzcyBiYXNlZCBvbiB0aGUgZXh0cmFjdGVkIGZpZWxkc1xuICAgICAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0uZm9yRWFjaChwb2ludGVyUGVybSA9PiB7XG4gICAgICAgIGxldCBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IGZhbHNlO1xuICAgICAgICBjb25zdCByZWFkVXNlckZpZWxkVmFsdWUgPSBvYmplY3RbcG9pbnRlclBlcm0ua2V5XTtcbiAgICAgICAgaWYgKHJlYWRVc2VyRmllbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlYWRVc2VyRmllbGRWYWx1ZSkpIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gcmVhZFVzZXJGaWVsZFZhbHVlLnNvbWUoXG4gICAgICAgICAgICAgIHVzZXIgPT4gdXNlci5vYmplY3RJZCAmJiB1c2VyLm9iamVjdElkID09PSB1c2VySWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID1cbiAgICAgICAgICAgICAgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkICYmIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCA9PT0gdXNlcklkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwb2ludGVyUGVybUluY2x1ZGVzVXNlcikge1xuICAgICAgICAgIG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gdHJ1ZTtcbiAgICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwb2ludGVyUGVybS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBpZiBhdCBsZWFzdCBvbmUgcG9pbnRlci1wZXJtaXNzaW9uIGFmZmVjdGVkIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgIC8vIGludGVyc2VjdCB2cyBwcm90ZWN0ZWRGaWVsZHMgZnJvbSBwcmV2aW91cyBzdGFnZSAoQHNlZSBhZGRQcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAvLyBTZXRzIHRoZW9yeSAoaW50ZXJzZWN0aW9ucyk6IEEgeCAoQiB4IEMpID09IChBIHggQikgeCBDXG4gICAgICBpZiAob3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHByb3RlY3RlZEZpZWxkcyk7XG4gICAgICB9XG4gICAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgLy8gaWYgdGhlcmUncmUgbm8gcHJvdGN0ZWRGaWVsZHMgYnkgb3RoZXIgY3JpdGVyaWEgKCBpZCAvIHJvbGUgLyBhdXRoKVxuICAgICAgICAgIC8vIHRoZW4gd2UgbXVzdCBpbnRlcnNlY3QgZWFjaCBzZXQgKHBlciB1c2VyRmllbGQpXG4gICAgICAgICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IGZpZWxkcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpc1VzZXJDbGFzcyA9IGNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcblxuICAvKiBzcGVjaWFsIHRyZWF0IGZvciB0aGUgdXNlciBjbGFzczogZG9uJ3QgZmlsdGVyIHByb3RlY3RlZEZpZWxkcyBpZiBjdXJyZW50bHkgbG9nZ2VkaW4gdXNlciBpc1xuICB0aGUgcmV0cmlldmVkIHVzZXIgKi9cbiAgaWYgKCEoaXNVc2VyQ2xhc3MgJiYgdXNlcklkICYmIG9iamVjdC5vYmplY3RJZCA9PT0gdXNlcklkKSkge1xuICAgIHByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuXG4gICAgLy8gZmllbGRzIG5vdCByZXF1ZXN0ZWQgYnkgY2xpZW50IChleGNsdWRlZCksXG4gICAgLy9idXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdHRlZEZpZWxkc1xuICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcblxuICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbjtcbiAgZGVsZXRlIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll90b21ic3RvbmU7XG4gIGRlbGV0ZSBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9mYWlsZWRfbG9naW5fY291bnQ7XG4gIGRlbGV0ZSBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuICBkZWxldGUgb2JqZWN0Ll9wYXNzd29yZF9oaXN0b3J5O1xuXG4gIGlmIChhY2xHcm91cC5pbmRleE9mKG9iamVjdC5vYmplY3RJZCkgPiAtMSkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmltcG9ydCB0eXBlIHsgTG9hZFNjaGVtYU9wdGlvbnMgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCBNb25nb1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgb2JqZWN0W2ZpcnN0S2V5XSA9IGV4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3RbZmlyc3RLZXldIHx8IHt9LCBuZXh0UGF0aCwgdmFsdWVbZmlyc3RLZXldKTtcbiAgZGVsZXRlIG9iamVjdFtrZXldO1xuICByZXR1cm4gb2JqZWN0O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCByZXNwb25zZSA9IHt9O1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICB9XG4gIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAvLyBkZXRlcm1pbmUgaWYgdGhhdCB3YXMgYW4gb3BcbiAgICBpZiAoXG4gICAgICBrZXlVcGRhdGUgJiZcbiAgICAgIHR5cGVvZiBrZXlVcGRhdGUgPT09ICdvYmplY3QnICYmXG4gICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgKSB7XG4gICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5kIG9uIGEga2V5cGF0aFxuICAgICAgZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG59XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgc2NoZW1hQ2FjaGU6IGFueSkge1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IHNjaGVtYUNhY2hlO1xuICAgIC8vIFdlIGRvbid0IHdhbnQgYSBtdXRhYmxlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIHRoZW4geW91IGNvdWxkIGhhdmVcbiAgICAvLyBvbmUgcmVxdWVzdCB0aGF0IHVzZXMgZGlmZmVyZW50IHNjaGVtYXMgZm9yIGRpZmZlcmVudCBwYXJ0cyBvZlxuICAgIC8vIGl0LiBJbnN0ZWFkLCB1c2UgbG9hZFNjaGVtYSB0byBnZXQgYSBzY2hlbWEuXG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIHRoaXMuc2NoZW1hQ2FjaGUsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAhU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICFpc1NwZWNpYWxVcGRhdGVLZXkocm9vdEZpZWxkTmFtZSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dICYmXG4gICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSkuc29tZShcbiAgICAgICAgICAgICAgICAgICAgaW5uZXJLZXkgPT4gaW5uZXJLZXkuaW5jbHVkZXMoJyQnKSB8fCBpbm5lcktleS5pbmNsdWRlcygnLicpXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB1cGRhdGUgPSB0cmFuc2Zvcm1PYmplY3RBQ0wodXBkYXRlKTtcbiAgICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHVwc2VydCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLFxuICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKHNraXBTYW5pdGl6YXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxVcGRhdGUsIHJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiBzdHJpbmcsIHVwZGF0ZTogYW55LCBvcHM6IGFueSkge1xuICAgIHZhciBwZW5kaW5nID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG4gICAgb3BzLmZvckVhY2goKHsga2V5LCBvcCB9KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMucmVtb3ZlUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHBlbmRpbmcpO1xuICB9XG5cbiAgLy8gQWRkcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIGFkZCB3YXMgc3VjY2Vzc2Z1bC5cbiAgYWRkUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvYyxcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSByZW1vdmUgd2FzXG4gIC8vIHN1Y2Nlc3NmdWwuXG4gIHJlbW92ZVJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICB2YXIgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIGRvYyxcbiAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgaWYgdGhleSB0cnkgdG8gZGVsZXRlIGEgbm9uLWV4aXN0ZW50IHJlbGF0aW9uLlxuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmVzIG9iamVjdHMgbWF0Y2hlcyB0aGlzIHF1ZXJ5IGZyb20gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIG9iamVjdCB3YXNcbiAgLy8gZGVsZXRlZC5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4gIC8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbiAgLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbiAgZGVzdHJveShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9ucyA9IHt9LFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBkZWxldGUgYnkgcXVlcnlcbiAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSk7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocGFyc2VGb3JtYXRTY2hlbWEgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBwYXJzZUZvcm1hdFNjaGVtYSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBXaGVuIGRlbGV0aW5nIHNlc3Npb25zIHdoaWxlIGNoYW5naW5nIHBhc3N3b3JkcywgZG9uJ3QgdGhyb3cgYW4gZXJyb3IgaWYgdGhleSBkb24ndCBoYXZlIGFueSBzZXNzaW9ucy5cbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcblxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdjcmVhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKSlcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgICAgIGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUob2JqZWN0KTtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgU2NoZW1hQ29udHJvbGxlci5jb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHNjaGVtYSksXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY2xhc3NTY2hlbWEgPSBzY2hlbWEuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgIGlmICghY2xhc3NTY2hlbWEpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSBPYmplY3Qua2V5cyhjbGFzc1NjaGVtYS5maWVsZHMpO1xuICAgIGNvbnN0IG5ld0tleXMgPSBmaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIHVuc2V0XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkXSAmJiBvYmplY3RbZmllbGRdLl9fb3AgJiYgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hRmllbGRzLmluZGV4T2YoZmllbGQpIDwgMDtcbiAgICB9KTtcbiAgICBpZiAobmV3S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhZGRzIGEgbWFya2VyIHRoYXQgbmV3IGZpZWxkIGlzIGJlaW5nIGFkZGluZyBkdXJpbmcgdXBkYXRlXG4gICAgICBydW5PcHRpb25zLmFkZHNGaWVsZCA9IHRydWU7XG5cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHJ1bk9wdGlvbnMuYWN0aW9uO1xuICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2FkZEZpZWxkJywgYWN0aW9uKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV29uJ3QgZGVsZXRlIGNvbGxlY3Rpb25zIGluIHRoZSBzeXN0ZW0gbmFtZXNwYWNlXG4gIC8qKlxuICAgKiBEZWxldGUgYWxsIGNsYXNzZXMgYW5kIGNsZWFycyB0aGUgc2NoZW1hIGNhY2hlXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gZmFzdCBzZXQgdG8gdHJ1ZSBpZiBpdCdzIG9rIHRvIGp1c3QgZGVsZXRlIHJvd3MgYW5kIG5vdCBpbmRleGVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSB3aGVuIHRoZSBkZWxldGlvbnMgY29tcGxldGVzXG4gICAqL1xuICBkZWxldGVFdmVyeXRoaW5nKGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8YW55PiB7XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gbnVsbDtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW3RoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpLCB0aGlzLnNjaGVtYUNhY2hlLmNsZWFyKCldKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLCByZWxhdGlvblNjaGVtYSwgeyBvd25pbmdJZCB9LCBmaW5kT3B0aW9ucylcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZywgcmVsYXRlZElkczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoXG4gICAgICAgIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgeyByZWxhdGVkSWQ6IHsgJGluOiByZWxhdGVkSWRzIH0gfSxcbiAgICAgICAgeyBrZXlzOiBbJ293bmluZ0lkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgb3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRvciddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKChzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuY291bnQoY2xhc3NOYW1lLCB7IGZpZWxkczoge30gfSwgbnVsbCwgJycsIGZhbHNlKSlcbiAgICAgICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAyNTUsXG4gICAgICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBpcyBub3QgZW1wdHksIGNvbnRhaW5zICR7Y291bnR9IG9iamVjdHMsIGNhbm5vdCBkcm9wIHNjaGVtYS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGNsYXNzTmFtZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbih3YXNQYXJzZUNvbGxlY3Rpb24gPT4ge1xuICAgICAgICAgICAgaWYgKHdhc1BhcnNlQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICByZWxhdGlvbkZpZWxkTmFtZXMubWFwKG5hbWUgPT5cbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwgbmFtZSkpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFRoaXMgaGVscHMgdG8gY3JlYXRlIGludGVybWVkaWF0ZSBvYmplY3RzIGZvciBzaW1wbGVyIGNvbXBhcmlzb24gb2ZcbiAgLy8ga2V5IHZhbHVlIHBhaXJzIHVzZWQgaW4gcXVlcnkgb2JqZWN0cy4gRWFjaCBrZXkgdmFsdWUgcGFpciB3aWxsIHJlcHJlc2VudGVkXG4gIC8vIGluIGEgc2ltaWxhciB3YXkgdG8ganNvblxuICBvYmplY3RUb0VudHJpZXNTdHJpbmdzKHF1ZXJ5OiBhbnkpOiBBcnJheTxzdHJpbmc+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocXVlcnkpLm1hcChhID0+IGEubWFwKHMgPT4gSlNPTi5zdHJpbmdpZnkocykpLmpvaW4oJzonKSk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBPUiBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlT3JPcGVyYXRpb24ocXVlcnk6IHsgJG9yOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJG9yKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kb3IubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBsb25nZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kb3Iuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRvci5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJG9yWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJG9yO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBOYWl2ZSBsb2dpYyByZWR1Y2VyIGZvciBBTkQgb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZUFuZE9wZXJhdGlvbihxdWVyeTogeyAkYW5kOiBBcnJheTxhbnk+IH0pOiBhbnkge1xuICAgIGlmICghcXVlcnkuJGFuZCkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJGFuZC5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIHNob3J0ZXIgcXVlcnkuXG4gICAgICAgICAgICBxdWVyeS4kYW5kLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcmVwZWF0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gd2hpbGUgKHJlcGVhdCk7XG4gICAgaWYgKHF1ZXJ5LiRhbmQubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRhbmRbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kYW5kO1xuICAgIH1cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBDb25zdHJhaW50cyBxdWVyeSB1c2luZyBDTFAncyBwb2ludGVyIHBlcm1pc3Npb25zIChQUCkgaWYgYW55LlxuICAvLyAxLiBFdHJhY3QgdGhlIHVzZXIgaWQgZnJvbSBjYWxsZXIncyBBQ0xncm91cDtcbiAgLy8gMi4gRXhjdHJhY3QgYSBsaXN0IG9mIGZpZWxkIG5hbWVzIHRoYXQgYXJlIFBQIGZvciB0YXJnZXQgY29sbGVjdGlvbiBhbmQgb3BlcmF0aW9uO1xuICAvLyAzLiBDb25zdHJhaW50IHRoZSBvcmlnaW5hbCBxdWVyeSBzbyB0aGF0IGVhY2ggUFAgZmllbGQgbXVzdFxuICAvLyBwb2ludCB0byBjYWxsZXIncyBpZCAob3IgY29udGFpbiBpdCBpbiBjYXNlIG9mIFBQIGZpZWxkIGJlaW5nIGFuIGFycmF5KVxuICBhZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXVxuICApOiBhbnkge1xuICAgIC8vIENoZWNrIGlmIGNsYXNzIGhhcyBwdWJsaWMgcGVybWlzc2lvbiBmb3Igb3BlcmF0aW9uXG4gICAgLy8gSWYgdGhlIEJhc2VDTFAgcGFzcywgbGV0IGdvIHRocm91Z2hcbiAgICBpZiAoc2NoZW1hLnRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWUsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpO1xuXG4gICAgY29uc3QgdXNlckFDTCA9IGFjbEdyb3VwLmZpbHRlcihhY2wgPT4ge1xuICAgICAgcmV0dXJuIGFjbC5pbmRleE9mKCdyb2xlOicpICE9IDAgJiYgYWNsICE9ICcqJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIGNvbnN0IHBlcm1GaWVsZHMgPSBbXTtcblxuICAgIGlmIChwZXJtc1tvcGVyYXRpb25dICYmIHBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcykge1xuICAgICAgcGVybUZpZWxkcy5wdXNoKC4uLnBlcm1zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwZXJtc1tncm91cEtleV0pIHtcbiAgICAgICAgaWYgKCFwZXJtRmllbGRzLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBlcm1GaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcXVlcmllcyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkRGVzY3JpcHRvciA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPVxuICAgICAgICAgIGZpZWxkRGVzY3JpcHRvciAmJlxuICAgICAgICAgIHR5cGVvZiBmaWVsZERlc2NyaXB0b3IgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkRGVzY3JpcHRvciwgJ3R5cGUnKVxuICAgICAgICAgICAgPyBmaWVsZERlc2NyaXB0b3IudHlwZVxuICAgICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGxldCBxdWVyeUNsYXVzZTtcblxuICAgICAgICBpZiAoZmllbGRUeXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBzaW5nbGUgcG9pbnRlciBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciB1c2Vycy1hcnJheSBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogeyAkYWxsOiBbdXNlclBvaW50ZXJdIH0gfTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igb2JqZWN0IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGVyZSBpcyBhIENMUCBmaWVsZCBvZiBhbiB1bmV4cGVjdGVkIHR5cGUuIFRoaXMgY29uZGl0aW9uIHNob3VsZCBub3QgaGFwcGVuLCB3aGljaCBpc1xuICAgICAgICAgIC8vIHdoeSBpcyBiZWluZyB0cmVhdGVkIGFzIGFuIGVycm9yLlxuICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgYEFuIHVuZXhwZWN0ZWQgY29uZGl0aW9uIG9jY3VycmVkIHdoZW4gcmVzb2x2aW5nIHBvaW50ZXIgcGVybWlzc2lvbnM6ICR7Y2xhc3NOYW1lfSAke2tleX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHF1ZXJ5LCBrZXkpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlQW5kT3BlcmF0aW9uKHsgJGFuZDogW3F1ZXJ5Q2xhdXNlLCBxdWVyeV0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgYWRkIHRoZSBjb25zdGFpbnRcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCBxdWVyeUNsYXVzZSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHF1ZXJpZXMubGVuZ3RoID09PSAxID8gcXVlcmllc1swXSA6IHRoaXMucmVkdWNlT3JPcGVyYXRpb24oeyAkb3I6IHF1ZXJpZXMgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBhZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSA9IHt9LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdLFxuICAgIGF1dGg6IGFueSA9IHt9LFxuICAgIHF1ZXJ5T3B0aW9uczogRnVsbFF1ZXJ5T3B0aW9ucyA9IHt9XG4gICk6IG51bGwgfCBzdHJpbmdbXSB7XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgaWYgKCFwZXJtcykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGFjbEdyb3VwLmluZGV4T2YocXVlcnkub2JqZWN0SWQpID4gLTEpIHJldHVybiBudWxsO1xuXG4gICAgLy8gZm9yIHF1ZXJpZXMgd2hlcmUgXCJrZXlzXCIgYXJlIHNldCBhbmQgZG8gbm90IGluY2x1ZGUgYWxsICd1c2VyRmllbGQnOntmaWVsZH0sXG4gICAgLy8gd2UgaGF2ZSB0byB0cmFuc3BhcmVudGx5IGluY2x1ZGUgaXQsIGFuZCB0aGVuIHJlbW92ZSBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudFxuICAgIC8vIEJlY2F1c2UgaWYgc3VjaCBrZXkgbm90IHByb2plY3RlZCB0aGUgcGVybWlzc2lvbiB3b24ndCBiZSBlbmZvcmNlZCBwcm9wZXJseVxuICAgIC8vIFBTIHRoaXMgaXMgY2FsbGVkIHdoZW4gJ2V4Y2x1ZGVLZXlzJyBhbHJlYWR5IHJlZHVjZWQgdG8gJ2tleXMnXG4gICAgY29uc3QgcHJlc2VydmVLZXlzID0gcXVlcnlPcHRpb25zLmtleXM7XG5cbiAgICAvLyB0aGVzZSBhcmUga2V5cyB0aGF0IG5lZWQgdG8gYmUgaW5jbHVkZWQgb25seVxuICAgIC8vIHRvIGJlIGFibGUgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzIGJ5IHBvaW50ZXJcbiAgICAvLyBhbmQgdGhlbiB1bnNldCBiZWZvcmUgcmV0dXJuaW5nIHRvIGNsaWVudCAobGF0ZXIgaW4gIGZpbHRlclNlbnNpdGl2ZUZpZWxkcylcbiAgICBjb25zdCBzZXJ2ZXJPbmx5S2V5cyA9IFtdO1xuXG4gICAgY29uc3QgYXV0aGVudGljYXRlZCA9IGF1dGgudXNlcjtcblxuICAgIC8vIG1hcCB0byBhbGxvdyBjaGVjayB3aXRob3V0IGFycmF5IHNlYXJjaFxuICAgIGNvbnN0IHJvbGVzID0gKGF1dGgudXNlclJvbGVzIHx8IFtdKS5yZWR1Y2UoKGFjYywgcikgPT4ge1xuICAgICAgYWNjW3JdID0gcHJvdGVjdGVkRmllbGRzW3JdO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBhcnJheSBvZiBzZXRzIG9mIHByb3RlY3RlZCBmaWVsZHMuIHNlcGFyYXRlIGl0ZW0gZm9yIGVhY2ggYXBwbGljYWJsZSBjcml0ZXJpYVxuICAgIGNvbnN0IHByb3RlY3RlZEtleXNTZXRzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIHNraXAgdXNlckZpZWxkc1xuICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpIHtcbiAgICAgICAgaWYgKHByZXNlcnZlS2V5cykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoMTApO1xuICAgICAgICAgIGlmICghcHJlc2VydmVLZXlzLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICAgIC8vIDEuIHB1dCBpdCB0aGVyZSB0ZW1wb3JhcmlseVxuICAgICAgICAgICAgcXVlcnlPcHRpb25zLmtleXMgJiYgcXVlcnlPcHRpb25zLmtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgLy8gMi4gcHJlc2VydmUgaXQgZGVsZXRlIGxhdGVyXG4gICAgICAgICAgICBzZXJ2ZXJPbmx5S2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBhZGQgcHVibGljIHRpZXJcbiAgICAgIGlmIChrZXkgPT09ICcqJykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhdXRoZW50aWNhdGVkJykge1xuICAgICAgICAgIC8vIGZvciBsb2dnZWQgaW4gdXNlcnNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHByb3RlY3RlZEZpZWxkc1trZXldKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyb2xlc1trZXldICYmIGtleS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgICAgICAgLy8gYWRkIGFwcGxpY2FibGUgcm9sZXNcbiAgICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHJvbGVzW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUncyBhIHJ1bGUgZm9yIGN1cnJlbnQgdXNlcidzIGlkXG4gICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9IGF1dGgudXNlci5pZDtcbiAgICAgIGlmIChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSkge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzU2V0cy5wdXNoKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBwcmVzZXJ2ZSBmaWVsZHMgdG8gYmUgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyByZXNwb25zZSB0byBjbGllbnRcbiAgICBpZiAoc2VydmVyT25seUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMgPSBzZXJ2ZXJPbmx5S2V5cztcbiAgICB9XG5cbiAgICBsZXQgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXNTZXRzLnJlZHVjZSgoYWNjLCBuZXh0KSA9PiB7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBhY2MucHVzaCguLi5uZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgIHByb3RlY3RlZEtleXNTZXRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5cyA9IHByb3RlY3RlZEtleXMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBwcm90ZWN0ZWRLZXlzO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4odHJhbnNhY3Rpb25hbFNlc3Npb24gPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbjtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGNvbW1pdCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB9KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gYWJvcnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFRPRE86IGNyZWF0ZSBpbmRleGVzIG9uIGZpcnN0IGNyZWF0aW9uIG9mIGEgX1VzZXIgb2JqZWN0LiBPdGhlcndpc2UgaXQncyBpbXBvc3NpYmxlIHRvXG4gIC8vIGhhdmUgYSBQYXJzZSBhcHAgd2l0aG91dCBpdCBoYXZpbmcgYSBfVXNlciBjb2xsZWN0aW9uLlxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKSB7XG4gICAgY29uc3QgcmVxdWlyZWRVc2VyRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1VzZXIsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRSb2xlRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1JvbGUsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IHVzZXJDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiBzY2hlbWEuZW5mb3JjZUNsYXNzRXhpc3RzKCdfVXNlcicpKTtcbiAgICBjb25zdCByb2xlQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgY29uc3QgaWRlbXBvdGVuY3lDbGFzc1Byb21pc2UgPVxuICAgICAgdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlclxuICAgICAgICA/IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKVxuICAgICAgICA6IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gICAgY29uc3QgdXNlcm5hbWVVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgdXNlcm5hbWVzOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCB1c2VybmFtZUNhc2VJbnNlbnNpdGl2ZUluZGV4ID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZUluZGV4KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcmVxdWlyZWRVc2VyRmllbGRzLFxuICAgICAgICAgIFsndXNlcm5hbWUnXSxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIHVzZXJuYW1lIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBlbWFpbFVuaXF1ZW5lc3MgPSB1c2VyQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCA9IHVzZXJDbGFzc1Byb21pc2VcbiAgICAgIC50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYWRhcHRlci5lbnN1cmVJbmRleChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHJlcXVpcmVkVXNlckZpZWxkcyxcbiAgICAgICAgICBbJ2VtYWlsJ10sXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSBlbWFpbCBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVuaXF1ZW5lc3MgPSByb2xlQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaWRlbXBvdGVuY3lSZXF1ZXN0SWRJbmRleCA9XG4gICAgICB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyXG4gICAgICAgID8gaWRlbXBvdGVuY3lDbGFzc1Byb21pc2VcbiAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsncmVxSWQnXSlcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIGlkZW1wb3RlbmN5IHJlcXVlc3QgSUQ6ICcsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgIDogUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgICBjb25zdCBpZGVtcG90ZW5jeUV4cGlyZUluZGV4ID1cbiAgICAgIHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXJcbiAgICAgICAgPyBpZGVtcG90ZW5jeUNsYXNzUHJvbWlzZVxuICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlSW5kZXgoXG4gICAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgICByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLFxuICAgICAgICAgICAgICBbJ2V4cGlyZSddLFxuICAgICAgICAgICAgICAndHRsJyxcbiAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgIHsgdHRsOiAwIH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgIDogUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgICBjb25zdCBpbmRleFByb21pc2UgPSB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcblxuICAgIC8vIENyZWF0ZSB0YWJsZXMgZm9yIHZvbGF0aWxlIGNsYXNzZXNcbiAgICBjb25zdCBhZGFwdGVySW5pdCA9IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB1c2VybmFtZVVuaXF1ZW5lc3MsXG4gICAgICB1c2VybmFtZUNhc2VJbnNlbnNpdGl2ZUluZGV4LFxuICAgICAgZW1haWxVbmlxdWVuZXNzLFxuICAgICAgZW1haWxDYXNlSW5zZW5zaXRpdmVJbmRleCxcbiAgICAgIHJvbGVVbmlxdWVuZXNzLFxuICAgICAgaWRlbXBvdGVuY3lSZXF1ZXN0SWRJbmRleCxcbiAgICAgIGlkZW1wb3RlbmN5RXhwaXJlSW5kZXgsXG4gICAgICBhZGFwdGVySW5pdCxcbiAgICAgIGluZGV4UHJvbWlzZSxcbiAgICBdKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogYW55ID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG4iXX0=