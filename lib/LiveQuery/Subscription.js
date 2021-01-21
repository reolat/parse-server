"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Subscription = void 0;

var _logger = _interopRequireDefault(require("../logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Subscription {
  // It is query condition eg query.where
  constructor(className, query, queryHash) {
    this.className = className;
    this.query = query;
    this.hash = queryHash;
    this.clientRequestIds = new Map();
  }

  addClientSubscription(clientId, requestId) {
    if (!this.clientRequestIds.has(clientId)) {
      this.clientRequestIds.set(clientId, []);
    }

    const requestIds = this.clientRequestIds.get(clientId);
    requestIds.push(requestId);
  }

  deleteClientSubscription(clientId, requestId) {
    const requestIds = this.clientRequestIds.get(clientId);

    if (typeof requestIds === 'undefined') {
      _logger.default.error('Can not find client %d to delete', clientId);

      return;
    }

    const index = requestIds.indexOf(requestId);

    if (index < 0) {
      _logger.default.error('Can not find client %d subscription %d to delete', clientId, requestId);

      return;
    }

    requestIds.splice(index, 1); // Delete client reference if it has no subscription

    if (requestIds.length == 0) {
      this.clientRequestIds.delete(clientId);
    }
  }

  hasSubscribingClient() {
    return this.clientRequestIds.size > 0;
  }

}

exports.Subscription = Subscription;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvU3Vic2NyaXB0aW9uLmpzIl0sIm5hbWVzIjpbIlN1YnNjcmlwdGlvbiIsImNvbnN0cnVjdG9yIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJxdWVyeUhhc2giLCJoYXNoIiwiY2xpZW50UmVxdWVzdElkcyIsIk1hcCIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkIiwiaGFzIiwic2V0IiwicmVxdWVzdElkcyIsImdldCIsInB1c2giLCJkZWxldGVDbGllbnRTdWJzY3JpcHRpb24iLCJsb2dnZXIiLCJlcnJvciIsImluZGV4IiwiaW5kZXhPZiIsInNwbGljZSIsImxlbmd0aCIsImRlbGV0ZSIsImhhc1N1YnNjcmliaW5nQ2xpZW50Iiwic2l6ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7O0FBS0EsTUFBTUEsWUFBTixDQUFtQjtBQUNqQjtBQU1BQyxFQUFBQSxXQUFXLENBQUNDLFNBQUQsRUFBb0JDLEtBQXBCLEVBQXNDQyxTQUF0QyxFQUF5RDtBQUNsRSxTQUFLRixTQUFMLEdBQWlCQSxTQUFqQjtBQUNBLFNBQUtDLEtBQUwsR0FBYUEsS0FBYjtBQUNBLFNBQUtFLElBQUwsR0FBWUQsU0FBWjtBQUNBLFNBQUtFLGdCQUFMLEdBQXdCLElBQUlDLEdBQUosRUFBeEI7QUFDRDs7QUFFREMsRUFBQUEscUJBQXFCLENBQUNDLFFBQUQsRUFBbUJDLFNBQW5CLEVBQTRDO0FBQy9ELFFBQUksQ0FBQyxLQUFLSixnQkFBTCxDQUFzQkssR0FBdEIsQ0FBMEJGLFFBQTFCLENBQUwsRUFBMEM7QUFDeEMsV0FBS0gsZ0JBQUwsQ0FBc0JNLEdBQXRCLENBQTBCSCxRQUExQixFQUFvQyxFQUFwQztBQUNEOztBQUNELFVBQU1JLFVBQVUsR0FBRyxLQUFLUCxnQkFBTCxDQUFzQlEsR0FBdEIsQ0FBMEJMLFFBQTFCLENBQW5CO0FBQ0FJLElBQUFBLFVBQVUsQ0FBQ0UsSUFBWCxDQUFnQkwsU0FBaEI7QUFDRDs7QUFFRE0sRUFBQUEsd0JBQXdCLENBQUNQLFFBQUQsRUFBbUJDLFNBQW5CLEVBQTRDO0FBQ2xFLFVBQU1HLFVBQVUsR0FBRyxLQUFLUCxnQkFBTCxDQUFzQlEsR0FBdEIsQ0FBMEJMLFFBQTFCLENBQW5COztBQUNBLFFBQUksT0FBT0ksVUFBUCxLQUFzQixXQUExQixFQUF1QztBQUNyQ0ksc0JBQU9DLEtBQVAsQ0FBYSxrQ0FBYixFQUFpRFQsUUFBakQ7O0FBQ0E7QUFDRDs7QUFFRCxVQUFNVSxLQUFLLEdBQUdOLFVBQVUsQ0FBQ08sT0FBWCxDQUFtQlYsU0FBbkIsQ0FBZDs7QUFDQSxRQUFJUyxLQUFLLEdBQUcsQ0FBWixFQUFlO0FBQ2JGLHNCQUFPQyxLQUFQLENBQ0Usa0RBREYsRUFFRVQsUUFGRixFQUdFQyxTQUhGOztBQUtBO0FBQ0Q7O0FBQ0RHLElBQUFBLFVBQVUsQ0FBQ1EsTUFBWCxDQUFrQkYsS0FBbEIsRUFBeUIsQ0FBekIsRUFoQmtFLENBaUJsRTs7QUFDQSxRQUFJTixVQUFVLENBQUNTLE1BQVgsSUFBcUIsQ0FBekIsRUFBNEI7QUFDMUIsV0FBS2hCLGdCQUFMLENBQXNCaUIsTUFBdEIsQ0FBNkJkLFFBQTdCO0FBQ0Q7QUFDRjs7QUFFRGUsRUFBQUEsb0JBQW9CLEdBQVk7QUFDOUIsV0FBTyxLQUFLbEIsZ0JBQUwsQ0FBc0JtQixJQUF0QixHQUE2QixDQUFwQztBQUNEOztBQS9DZ0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCB0eXBlIEZsYXR0ZW5lZE9iamVjdERhdGEgPSB7IFthdHRyOiBzdHJpbmddOiBhbnkgfTtcbmV4cG9ydCB0eXBlIFF1ZXJ5RGF0YSA9IHsgW2F0dHI6IHN0cmluZ106IGFueSB9O1xuXG5jbGFzcyBTdWJzY3JpcHRpb24ge1xuICAvLyBJdCBpcyBxdWVyeSBjb25kaXRpb24gZWcgcXVlcnkud2hlcmVcbiAgcXVlcnk6IFF1ZXJ5RGF0YTtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIGhhc2g6IHN0cmluZztcbiAgY2xpZW50UmVxdWVzdElkczogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogUXVlcnlEYXRhLCBxdWVyeUhhc2g6IHN0cmluZykge1xuICAgIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIHRoaXMucXVlcnkgPSBxdWVyeTtcbiAgICB0aGlzLmhhc2ggPSBxdWVyeUhhc2g7XG4gICAgdGhpcy5jbGllbnRSZXF1ZXN0SWRzID0gbmV3IE1hcCgpO1xuICB9XG5cbiAgYWRkQ2xpZW50U3Vic2NyaXB0aW9uKGNsaWVudElkOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLmNsaWVudFJlcXVlc3RJZHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgdGhpcy5jbGllbnRSZXF1ZXN0SWRzLnNldChjbGllbnRJZCwgW10pO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWRzID0gdGhpcy5jbGllbnRSZXF1ZXN0SWRzLmdldChjbGllbnRJZCk7XG4gICAgcmVxdWVzdElkcy5wdXNoKHJlcXVlc3RJZCk7XG4gIH1cblxuICBkZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQ6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByZXF1ZXN0SWRzID0gdGhpcy5jbGllbnRSZXF1ZXN0SWRzLmdldChjbGllbnRJZCk7XG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0SWRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgY2xpZW50ICVkIHRvIGRlbGV0ZScsIGNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleCA9IHJlcXVlc3RJZHMuaW5kZXhPZihyZXF1ZXN0SWQpO1xuICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBjbGllbnQgJWQgc3Vic2NyaXB0aW9uICVkIHRvIGRlbGV0ZScsXG4gICAgICAgIGNsaWVudElkLFxuICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJlcXVlc3RJZHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAvLyBEZWxldGUgY2xpZW50IHJlZmVyZW5jZSBpZiBpdCBoYXMgbm8gc3Vic2NyaXB0aW9uXG4gICAgaWYgKHJlcXVlc3RJZHMubGVuZ3RoID09IDApIHtcbiAgICAgIHRoaXMuY2xpZW50UmVxdWVzdElkcy5kZWxldGUoY2xpZW50SWQpO1xuICAgIH1cbiAgfVxuXG4gIGhhc1N1YnNjcmliaW5nQ2xpZW50KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmNsaWVudFJlcXVlc3RJZHMuc2l6ZSA+IDA7XG4gIH1cbn1cblxuZXhwb3J0IHsgU3Vic2NyaXB0aW9uIH07XG4iXX0=