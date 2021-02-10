"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AggregateRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

var _UsersRouter = _interopRequireDefault(require("./UsersRouter"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const BASE_KEYS = ['where', 'distinct', 'pipeline', 'hint', 'explain'];
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'search', 'skip', 'sort', 'sortByCount', 'unwind'];
const ALLOWED_KEYS = [...BASE_KEYS, ...PIPELINE_KEYS];

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
    }

    if (body.hint) {
      options.hint = body.hint;
      delete body.hint;
    }

    if (body.explain) {
      options.explain = body.explain;
      delete body.explain;
    }

    if (body.readPreference) {
      options.readPreference = body.readPreference;
      delete body.readPreference;
    }

    options.pipeline = AggregateRouter.getPipeline(body);

    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK, req.info.context).then(response => {
      for (const result of response.results) {
        if (typeof result === 'object') {
          _UsersRouter.default.removeHiddenProperties(result);
        }
      }

      return {
        response
      };
    });
  }
  /* Builds a pipeline from the body. Originally the body could be passed as a single object,
   * and now we support many options
   *
   * Array
   *
   * body: [{
   *   group: { objectId: '$name' },
   * }]
   *
   * Object
   *
   * body: {
   *   group: { objectId: '$name' },
   * }
   *
   *
   * Pipeline Operator with an Array or an Object
   *
   * body: {
   *   pipeline: {
   *     group: { objectId: '$name' },
   *   }
   * }
   *
   */


  static getPipeline(body) {
    let pipeline = body.pipeline || body;

    if (!Array.isArray(pipeline)) {
      pipeline = Object.keys(pipeline).map(key => {
        return {
          [key]: pipeline[key]
        };
      });
    }

    return pipeline.map(stage => {
      const keys = Object.keys(stage);

      if (keys.length != 1) {
        throw new Error(`Pipeline stages should only have one key found ${keys.join(', ')}`);
      }

      return AggregateRouter.transformStage(keys[0], stage);
    });
  }

  static transformStage(stageName, stage) {
    if (ALLOWED_KEYS.indexOf(stageName) === -1) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: ${stageName}`);
    }

    if (stageName === 'group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Please use objectId instead of _id`);
      }

      if (!Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. objectId is required`);
      }

      stage[stageName]._id = stage[stageName].objectId;
      delete stage[stageName].objectId;
    }

    return {
      [`$${stageName}`]: stage[stageName]
    };
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }

}

exports.AggregateRouter = AggregateRouter;
var _default = AggregateRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwiaGludCIsImV4cGxhaW4iLCJyZWFkUHJlZmVyZW5jZSIsInBpcGVsaW5lIiwiZ2V0UGlwZWxpbmUiLCJ3aGVyZSIsIkpTT04iLCJwYXJzZSIsInJlc3QiLCJmaW5kIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsImluZm8iLCJjbGllbnRTREsiLCJjb250ZXh0IiwidGhlbiIsInJlc3BvbnNlIiwicmVzdWx0IiwicmVzdWx0cyIsIlVzZXJzUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIkFycmF5IiwiaXNBcnJheSIsImtleXMiLCJtYXAiLCJrZXkiLCJzdGFnZSIsImxlbmd0aCIsIkVycm9yIiwiam9pbiIsInRyYW5zZm9ybVN0YWdlIiwic3RhZ2VOYW1lIiwiaW5kZXhPZiIsIlBhcnNlIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9pZCIsIm9iamVjdElkIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxVQUFWLEVBQXNCLFVBQXRCLEVBQWtDLE1BQWxDLEVBQTBDLFNBQTFDLENBQWxCO0FBRUEsTUFBTUMsYUFBYSxHQUFHLENBQ3BCLFdBRG9C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S0FBdkQsQ0FBSixFQUFtRTtBQUNqRSxjQUFNLElBQUlFLGNBQU1MLEtBQVYsQ0FDSkssY0FBTUwsS0FBTixDQUFZTSxhQURSLEVBRUgsd0VBRkcsQ0FBTjtBQUlEOztBQUNELFVBQUksQ0FBQzFDLE1BQU0sQ0FBQzJDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ1gsS0FBSyxDQUFDSyxTQUFELENBQTFDLEVBQXVELFVBQXZELENBQUwsRUFBeUU7QUFDdkUsY0FBTSxJQUFJRSxjQUFNTCxLQUFWLENBQ0pLLGNBQU1MLEtBQU4sQ0FBWU0sYUFEUixFQUVILDBEQUZHLENBQU47QUFJRDs7QUFDRFIsTUFBQUEsS0FBSyxDQUFDSyxTQUFELENBQUwsQ0FBaUJPLEdBQWpCLEdBQXVCWixLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQlEsUUFBeEM7QUFDQSxhQUFPYixLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQlEsUUFBeEI7QUFDRDs7QUFDRCxXQUFPO0FBQUUsT0FBRSxJQUFHUixTQUFVLEVBQWYsR0FBbUJMLEtBQUssQ0FBQ0ssU0FBRDtBQUExQixLQUFQO0FBQ0Q7O0FBRURTLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCLHVCQUFsQixFQUEyQ0MsVUFBVSxDQUFDQyw2QkFBdEQsRUFBcUZyRCxHQUFHLElBQUk7QUFDMUYsYUFBTyxLQUFLRCxVQUFMLENBQWdCQyxHQUFoQixDQUFQO0FBQ0QsS0FGRDtBQUdEOztBQWhIZ0Q7OztlQW1IcENILGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcblxuY29uc3QgQkFTRV9LRVlTID0gWyd3aGVyZScsICdkaXN0aW5jdCcsICdwaXBlbGluZScsICdoaW50JywgJ2V4cGxhaW4nXTtcblxuY29uc3QgUElQRUxJTkVfS0VZUyA9IFtcbiAgJ2FkZEZpZWxkcycsXG4gICdidWNrZXQnLFxuICAnYnVja2V0QXV0bycsXG4gICdjb2xsU3RhdHMnLFxuICAnY291bnQnLFxuICAnY3VycmVudE9wJyxcbiAgJ2ZhY2V0JyxcbiAgJ2dlb05lYXInLFxuICAnZ3JhcGhMb29rdXAnLFxuICAnZ3JvdXAnLFxuICAnaW5kZXhTdGF0cycsXG4gICdsaW1pdCcsXG4gICdsaXN0TG9jYWxTZXNzaW9ucycsXG4gICdsaXN0U2Vzc2lvbnMnLFxuICAnbG9va3VwJyxcbiAgJ21hdGNoJyxcbiAgJ291dCcsXG4gICdwcm9qZWN0JyxcbiAgJ3JlZGFjdCcsXG4gICdyZXBsYWNlUm9vdCcsXG4gICdzYW1wbGUnLFxuICAnc2VhcmNoJyxcbiAgJ3NraXAnLFxuICAnc29ydCcsXG4gICdzb3J0QnlDb3VudCcsXG4gICd1bndpbmQnLFxuXTtcblxuY29uc3QgQUxMT1dFRF9LRVlTID0gWy4uLkJBU0VfS0VZUywgLi4uUElQRUxJTkVfS0VZU107XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihyZXEuYm9keSwgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSkpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgaWYgKGJvZHkuaGludCkge1xuICAgICAgb3B0aW9ucy5oaW50ID0gYm9keS5oaW50O1xuICAgICAgZGVsZXRlIGJvZHkuaGludDtcbiAgICB9XG4gICAgaWYgKGJvZHkuZXhwbGFpbikge1xuICAgICAgb3B0aW9ucy5leHBsYWluID0gYm9keS5leHBsYWluO1xuICAgICAgZGVsZXRlIGJvZHkuZXhwbGFpbjtcbiAgICB9XG4gICAgaWYgKGJvZHkucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIG9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgZGVsZXRlIGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBBZ2dyZWdhdGVSb3V0ZXIudHJhbnNmb3JtU3RhZ2Uoa2V5c1swXSwgc3RhZ2UpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIHRyYW5zZm9ybVN0YWdlKHN0YWdlTmFtZSwgc3RhZ2UpIHtcbiAgICBpZiAoQUxMT1dFRF9LRVlTLmluZGV4T2Yoc3RhZ2VOYW1lKSA9PT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiAke3N0YWdlTmFtZX1gKTtcbiAgICB9XG4gICAgaWYgKHN0YWdlTmFtZSA9PT0gJ2dyb3VwJykge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZVtzdGFnZU5hbWVdLCAnX2lkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIFBsZWFzZSB1c2Ugb2JqZWN0SWQgaW5zdGVhZCBvZiBfaWRgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZVtzdGFnZU5hbWVdLCAnb2JqZWN0SWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiBncm91cC4gb2JqZWN0SWQgaXMgcmVxdWlyZWRgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBzdGFnZVtzdGFnZU5hbWVdLl9pZCA9IHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgICBkZWxldGUgc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICB9XG4gICAgcmV0dXJuIHsgW2AkJHtzdGFnZU5hbWV9YF06IHN0YWdlW3N0YWdlTmFtZV0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvYWdncmVnYXRlLzpjbGFzc05hbWUnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEFnZ3JlZ2F0ZVJvdXRlcjtcbiJdfQ==