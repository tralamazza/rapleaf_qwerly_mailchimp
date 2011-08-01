/*
 * Author: Daniel Tralamazza <tralamazza@gmail.com>
 */

var QwerlyAPI = require('../vendor/qwerly-node/lib/qwerly').V1,
  EventEmitter = process.EventEmitter;

module.exports = Qwerly;

function Qwerly(config, db) {
  this.QPS = (1 / config.qwerly.cps) * 1100; // queries per millisecond (+10% margin)
  this.qwerly = new QwerlyAPI(config.qwerly.key); // Qwerly API
  this.members = db.collection(config.mongodb.collection); // mongodb collection
};

Qwerly.prototype.__proto__ = EventEmitter.prototype;

Qwerly.prototype.fetch = function() {
  var self = this;
  self.members.find({}, { email: 1}).toArray(function(err, docs) { // fetch just emails
    if (err) throw '[mongodb] Error fetching members. ' + err;

    self.count = docs.length;
    var i = 0;
    var interId = setInterval(function() { // throttle each qwerly query
      var email = docs[i].email;
      
      self.qwerly.services().viaEmail(email, function(err, res) {
        if (err)
          self.emit('error', '[qwerly] Error processing "' + email + '" ' + err.body);
        else if (res.status == 200) { // non status 200 are ignored for now
          self.count++;
          self.members.update(
            { _id: email },
            { $set: { qwerly: res.services } },
            true, function(err, docs) {
              if (err) self.emit('error', '[mongodb] ' + err);
              if (--self.count == 0) self.emit('fetch');
            });
        }
        if (--self.count == 0) self.emit('fetch');
      });

      if (++i >= docs.length)
        clearInterval(interId); // stop timer
    }, self.QPS);
  });
};
