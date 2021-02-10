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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwiaGludCIsImV4cGxhaW4iLCJyZWFkUHJlZmVyZW5jZSIsInBpcGVsaW5lIiwiZ2V0UGlwZWxpbmUiLCJ3aGVyZSIsIkpTT04iLCJwYXJzZSIsInJlc3QiLCJmaW5kIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsImluZm8iLCJjbGllbnRTREsiLCJjb250ZXh0IiwidGhlbiIsInJlc3BvbnNlIiwicmVzdWx0IiwicmVzdWx0cyIsIlVzZXJzUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIkFycmF5IiwiaXNBcnJheSIsImtleXMiLCJtYXAiLCJrZXkiLCJzdGFnZSIsImxlbmd0aCIsIkVycm9yIiwiam9pbiIsInRyYW5zZm9ybVN0YWdlIiwic3RhZ2VOYW1lIiwiaW5kZXhPZiIsIlBhcnNlIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9pZCIsIm9iamVjdElkIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxVQUFWLEVBQXNCLFVBQXRCLEVBQWtDLE1BQWxDLEVBQTBDLFNBQTFDLENBQWxCO0FBRUEsTUFBTUMsYUFBYSxHQUFHLENBQ3BCLFdBRG9C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QTJCO0FBQ3pCLFVBQUl2QyxNQUFNLENBQUMyQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNYLEtBQUssQ0FBQ0ssU0FBRCxDQUExQyxFQUF1RCxLQUF2RCxDQUFKLEVBQW1FO0FBQ2pFLGNBQU0sSUFBSUUsY0FBTUwsS0FBVixDQUNKSyxjQUFNTCxLQUFOLENBQVlNLGFBRFIsRUFFSCx3RUFGRyxDQUFOO0FBSUQ7O0FBQ0QsVUFBSSxDQUFDMUMsTUFBTSxDQUFDMkMsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDWCxLQUFLLENBQUNLLFNBQUQsQ0FBMUMsRUFBdUQsVUFBdkQsQ0FBTCxFQUF5RTtBQUN2RSxjQUFNLElBQUlFLGNBQU1MLEtBQVYsQ0FDSkssY0FBTUwsS0FBTixDQUFZTSxhQURSLEVBRUgsMERBRkcsQ0FBTjtBQUlEOztBQUNEUixNQUFBQSxLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQk8sR0FBakIsR0FBdUJaLEtBQUssQ0FBQ0ssU0FBRCxDQUFMLENBQWlCUSxRQUF4QztBQUNBLGFBQU9iLEtBQUssQ0FBQ0ssU0FBRCxDQUFMLENBQWlCUSxRQUF4QjtBQUNEOztBQUNELFdBQU87QUFBRSxPQUFFLElBQUdSLFNBQVUsRUFBZixHQUFtQkwsS0FBSyxDQUFDSyxTQUFEO0FBQTFCLEtBQVA7QUFDRDs7QUFFRFMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0IsdUJBQWxCLEVBQTJDQyxVQUFVLENBQUNDLDZCQUF0RCxFQUFxRnJELEdBQUcsSUFBSTtBQUMxRixhQUFPLEtBQUtELFVBQUwsQ0FBZ0JDLEdBQWhCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBaEhnRDs7O2VBbUhwQ0gsZSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4vVXNlcnNSb3V0ZXInO1xuXG5jb25zdCBCQVNFX0tFWVMgPSBbJ3doZXJlJywgJ2Rpc3RpbmN0JywgJ3BpcGVsaW5lJywgJ2hpbnQnLCAnZXhwbGFpbiddO1xuXG5jb25zdCBQSVBFTElORV9LRVlTID0gW1xuICAnYWRkRmllbGRzJyxcbiAgJ2J1Y2tldCcsXG4gICdidWNrZXRBdXRvJyxcbiAgJ2NvbGxTdGF0cycsXG4gICdjb3VudCcsXG4gICdjdXJyZW50T3AnLFxuICAnZmFjZXQnLFxuICAnZ2VvTmVhcicsXG4gICdncmFwaExvb2t1cCcsXG4gICdncm91cCcsXG4gICdpbmRleFN0YXRzJyxcbiAgJ2xpbWl0JyxcbiAgJ2xpc3RMb2NhbFNlc3Npb25zJyxcbiAgJ2xpc3RTZXNzaW9ucycsXG4gICdsb29rdXAnLFxuICAnbWF0Y2gnLFxuICAnb3V0JyxcbiAgJ3Byb2plY3QnLFxuICAncmVkYWN0JyxcbiAgJ3JlcGxhY2VSb290JyxcbiAgJ3NhbXBsZScsXG4gICdzZWFyY2gnLFxuICAnc2tpcCcsXG4gICdzb3J0JyxcbiAgJ3NvcnRCeUNvdW50JyxcbiAgJ3Vud2luZCcsXG5dO1xuXG5jb25zdCBBTExPV0VEX0tFWVMgPSBbLi4uQkFTRV9LRVlTLCAuLi5QSVBFTElORV9LRVlTXTtcblxuZXhwb3J0IGNsYXNzIEFnZ3JlZ2F0ZVJvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuICAgIGlmIChib2R5LmRpc3RpbmN0KSB7XG4gICAgICBvcHRpb25zLmRpc3RpbmN0ID0gU3RyaW5nKGJvZHkuZGlzdGluY3QpO1xuICAgIH1cbiAgICBpZiAoYm9keS5oaW50KSB7XG4gICAgICBvcHRpb25zLmhpbnQgPSBib2R5LmhpbnQ7XG4gICAgICBkZWxldGUgYm9keS5oaW50O1xuICAgIH1cbiAgICBpZiAoYm9keS5leHBsYWluKSB7XG4gICAgICBvcHRpb25zLmV4cGxhaW4gPSBib2R5LmV4cGxhaW47XG4gICAgICBkZWxldGUgYm9keS5leHBsYWluO1xuICAgIH1cbiAgICBpZiAoYm9keS5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgb3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgICBkZWxldGUgYm9keS5yZWFkUHJlZmVyZW5jZTtcbiAgICB9XG4gICAgb3B0aW9ucy5waXBlbGluZSA9IEFnZ3JlZ2F0ZVJvdXRlci5nZXRQaXBlbGluZShib2R5KTtcbiAgICBpZiAodHlwZW9mIGJvZHkud2hlcmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBib2R5LndoZXJlID0gSlNPTi5wYXJzZShib2R5LndoZXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgdGhpcy5jbGFzc05hbWUocmVxKSxcbiAgICAgICAgYm9keS53aGVyZSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyogQnVpbGRzIGEgcGlwZWxpbmUgZnJvbSB0aGUgYm9keS4gT3JpZ2luYWxseSB0aGUgYm9keSBjb3VsZCBiZSBwYXNzZWQgYXMgYSBzaW5nbGUgb2JqZWN0LFxuICAgKiBhbmQgbm93IHdlIHN1cHBvcnQgbWFueSBvcHRpb25zXG4gICAqXG4gICAqIEFycmF5XG4gICAqXG4gICAqIGJvZHk6IFt7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfV1cbiAgICpcbiAgICogT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XG4gICAqXG4gICAqXG4gICAqIFBpcGVsaW5lIE9wZXJhdG9yIHdpdGggYW4gQXJyYXkgb3IgYW4gT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBwaXBlbGluZToge1xuICAgKiAgICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICovXG4gIHN0YXRpYyBnZXRQaXBlbGluZShib2R5KSB7XG4gICAgbGV0IHBpcGVsaW5lID0gYm9keS5waXBlbGluZSB8fCBib2R5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHBpcGVsaW5lID0gT2JqZWN0LmtleXMocGlwZWxpbmUpLm1hcChrZXkgPT4ge1xuICAgICAgICByZXR1cm4geyBba2V5XTogcGlwZWxpbmVba2V5XSB9O1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc3RhZ2UpO1xuICAgICAgaWYgKGtleXMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQaXBlbGluZSBzdGFnZXMgc2hvdWxkIG9ubHkgaGF2ZSBvbmUga2V5IGZvdW5kICR7a2V5cy5qb2luKCcsICcpfWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEFnZ3JlZ2F0ZVJvdXRlci50cmFuc2Zvcm1TdGFnZShrZXlzWzBdLCBzdGFnZSk7XG4gICAgfSk7XG4gIH1cblxuICBzdGF0aWMgdHJhbnNmb3JtU3RhZ2Uoc3RhZ2VOYW1lLCBzdGFnZSkge1xuICAgIGlmIChBTExPV0VEX0tFWVMuaW5kZXhPZihzdGFnZU5hbWUpID09PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6ICR7c3RhZ2VOYW1lfWApO1xuICAgIH1cbiAgICBpZiAoc3RhZ2VOYW1lID09PSAnZ3JvdXAnKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdfaWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiBncm91cC4gUGxlYXNlIHVzZSBvYmplY3RJZCBpbnN0ZWFkIG9mIF9pZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdvYmplY3RJZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBvYmplY3RJZCBpcyByZXF1aXJlZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHN0YWdlW3N0YWdlTmFtZV0uX2lkID0gc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgIGRlbGV0ZSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgIH1cbiAgICByZXR1cm4geyBbYCQke3N0YWdlTmFtZX1gXTogc3RhZ2Vbc3RhZ2VOYW1lXSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9hZ2dyZWdhdGUvOmNsYXNzTmFtZScsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQWdncmVnYXRlUm91dGVyO1xuIl19