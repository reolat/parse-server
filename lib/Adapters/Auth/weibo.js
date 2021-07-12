"use strict";

// Helper functions for accessing the weibo Graph API.
var httpsRequest = require('./httpsRequest');

var Parse = require('parse/node').Parse;

var querystring = require('querystring'); // Returns a promise that fulfills iff this user id is valid.


function validateAuthData(authData) {
  return graphRequest(authData.access_token).then(function (data) {
    if (data && data.uid == authData.id) {
      return;
    }

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is invalid for this user.');
  });
} // Returns a promise that fulfills if this app id is valid.


function validateAppId() {
  return Promise.resolve();
} // A promisey wrapper for weibo graph requests.


function graphRequest(access_token) {
  var postData = querystring.stringify({
    access_token: access_token
  });
  var options = {
    hostname: 'api.weibo.com',
    path: '/oauth2/get_token_info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  return httpsRequest.request(options, postData);
}

module.exports = {
  validateAppId,
  validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL3dlaWJvLmpzIl0sIm5hbWVzIjpbImh0dHBzUmVxdWVzdCIsInJlcXVpcmUiLCJQYXJzZSIsInF1ZXJ5c3RyaW5nIiwidmFsaWRhdGVBdXRoRGF0YSIsImF1dGhEYXRhIiwiZ3JhcGhSZXF1ZXN0IiwiYWNjZXNzX3Rva2VuIiwidGhlbiIsImRhdGEiLCJ1aWQiLCJpZCIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsInZhbGlkYXRlQXBwSWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInBvc3REYXRhIiwic3RyaW5naWZ5Iiwib3B0aW9ucyIsImhvc3RuYW1lIiwicGF0aCIsIm1ldGhvZCIsImhlYWRlcnMiLCJCdWZmZXIiLCJieXRlTGVuZ3RoIiwicmVxdWVzdCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQSxJQUFJQSxZQUFZLEdBQUdDLE9BQU8sQ0FBQyxnQkFBRCxDQUExQjs7QUFDQSxJQUFJQyxLQUFLLEdBQUdELE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JDLEtBQWxDOztBQUNBLElBQUlDLFdBQVcsR0FBR0YsT0FBTyxDQUFDLGFBQUQsQ0FBekIsQyxDQUVBOzs7QUFDQSxTQUFTRyxnQkFBVCxDQUEwQkMsUUFBMUIsRUFBb0M7QUFDbEMsU0FBT0MsWUFBWSxDQUFDRCxRQUFRLENBQUNFLFlBQVYsQ0FBWixDQUFvQ0MsSUFBcEMsQ0FBeUMsVUFBVUMsSUFBVixFQUFnQjtBQUM5RCxRQUFJQSxJQUFJLElBQUlBLElBQUksQ0FBQ0MsR0FBTCxJQUFZTCxRQUFRLENBQUNNLEVBQWpDLEVBQXFDO0FBQ25DO0FBQ0Q7O0FBQ0QsVUFBTSxJQUFJVCxLQUFLLENBQUNVLEtBQVYsQ0FBZ0JWLEtBQUssQ0FBQ1UsS0FBTixDQUFZQyxnQkFBNUIsRUFBOEMsc0NBQTlDLENBQU47QUFDRCxHQUxNLENBQVA7QUFNRCxDLENBRUQ7OztBQUNBLFNBQVNDLGFBQVQsR0FBeUI7QUFDdkIsU0FBT0MsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRCxDLENBRUQ7OztBQUNBLFNBQVNWLFlBQVQsQ0FBc0JDLFlBQXRCLEVBQW9DO0FBQ2xDLE1BQUlVLFFBQVEsR0FBR2QsV0FBVyxDQUFDZSxTQUFaLENBQXNCO0FBQ25DWCxJQUFBQSxZQUFZLEVBQUVBO0FBRHFCLEdBQXRCLENBQWY7QUFHQSxNQUFJWSxPQUFPLEdBQUc7QUFDWkMsSUFBQUEsUUFBUSxFQUFFLGVBREU7QUFFWkMsSUFBQUEsSUFBSSxFQUFFLHdCQUZNO0FBR1pDLElBQUFBLE1BQU0sRUFBRSxNQUhJO0FBSVpDLElBQUFBLE9BQU8sRUFBRTtBQUNQLHNCQUFnQixtQ0FEVDtBQUVQLHdCQUFrQkMsTUFBTSxDQUFDQyxVQUFQLENBQWtCUixRQUFsQjtBQUZYO0FBSkcsR0FBZDtBQVNBLFNBQU9qQixZQUFZLENBQUMwQixPQUFiLENBQXFCUCxPQUFyQixFQUE4QkYsUUFBOUIsQ0FBUDtBQUNEOztBQUVEVSxNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZmQsRUFBQUEsYUFEZTtBQUVmVixFQUFBQTtBQUZlLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gSGVscGVyIGZ1bmN0aW9ucyBmb3IgYWNjZXNzaW5nIHRoZSB3ZWlibyBHcmFwaCBBUEkuXG52YXIgaHR0cHNSZXF1ZXN0ID0gcmVxdWlyZSgnLi9odHRwc1JlcXVlc3QnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJyk7XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgdXNlciBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEpIHtcbiAgcmV0dXJuIGdyYXBoUmVxdWVzdChhdXRoRGF0YS5hY2Nlc3NfdG9rZW4pLnRoZW4oZnVuY3Rpb24gKGRhdGEpIHtcbiAgICBpZiAoZGF0YSAmJiBkYXRhLnVpZCA9PSBhdXRoRGF0YS5pZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3dlaWJvIGF1dGggaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLicpO1xuICB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCBmdWxmaWxscyBpZiB0aGlzIGFwcCBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXBwSWQoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuLy8gQSBwcm9taXNleSB3cmFwcGVyIGZvciB3ZWlibyBncmFwaCByZXF1ZXN0cy5cbmZ1bmN0aW9uIGdyYXBoUmVxdWVzdChhY2Nlc3NfdG9rZW4pIHtcbiAgdmFyIHBvc3REYXRhID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHtcbiAgICBhY2Nlc3NfdG9rZW46IGFjY2Vzc190b2tlbixcbiAgfSk7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIGhvc3RuYW1lOiAnYXBpLndlaWJvLmNvbScsXG4gICAgcGF0aDogJy9vYXV0aDIvZ2V0X3Rva2VuX2luZm8nLFxuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcbiAgICAgICdDb250ZW50LUxlbmd0aCc6IEJ1ZmZlci5ieXRlTGVuZ3RoKHBvc3REYXRhKSxcbiAgICB9LFxuICB9O1xuICByZXR1cm4gaHR0cHNSZXF1ZXN0LnJlcXVlc3Qob3B0aW9ucywgcG9zdERhdGEpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdmFsaWRhdGVBcHBJZCxcbiAgdmFsaWRhdGVBdXRoRGF0YSxcbn07XG4iXX0=