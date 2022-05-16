/*
 * https://github.com/mjylha/Levenshtein-js/blob/master/levenshtein.js
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// var Levenshtein = Levenshtein || {};

export const Levenshtein = function(s, t) {

      if (s === null || t === null || (typeof s !== "string") || (typeof t !== "string") ) {
          throw "Strings must be defined";
      }

      var n = s.length; // length of s
      var m = t.length; // length of t

      if (n == 0) {
          return m;
      } else if (m == 0) {
          return n;
      }

      if (n > m) {
          // swap the input strings to consume less memory
          var tmp = s;
          s = t;
          t = tmp;
          n = m;
          m = t.length;
      }

      var p = new Array(n+1); //'previous' cost array, horizontally
      var d = new Array(n+1); // cost array, horizontally
      var _d; //placeholder to assist in swapping p and d

      // indexes into strings s and t
      var i; // iterates through s
      var j; // iterates through t

      var t_j; // jth character of t

      var cost; // cost

      for (i = 0; i<=n; i++) {
          p[i] = i;
      }

      for (j = 1; j<=m; j++) {
          t_j = t.charAt(j-1);
          d[0] = j;

          for (i=1; i<=n; i++) {
              cost = s.charAt(i-1)==t_j ? 0 : 1;
              // minimum of cell to the left+1, to the top+1, diagonally left and up +cost
              d[i] = Math.min(Math.min(d[i-1]+1, p[i]+1),  p[i-1]+cost);
          }

          // copy current distance counts to 'previous row' distance counts
          _d = p;
          p = d;
          d = _d;
      }

      // our last action in the above loop was to switch d and p, so p now 
      // actually has the most recent cost counts
      return p[n];
};
