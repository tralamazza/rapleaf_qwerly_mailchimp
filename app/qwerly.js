var QwerlyAPI = require('../vendor/qwerly-node/lib/qwerly').V1,
  EventEmitter = process.EventEmitter;

module.exports = Qwerly;

function Qwerly(config, db) {
  this.QPS = (1 / config.qwerly.cps) * 1100; // 10% slack
  this.qwerly = new QwerlyAPI(config.qwerly.key);
  this.members = db.collection(config.mongodb.collection);
};

Qwerly.prototype.__proto__ = EventEmitter.prototype;

Qwerly.prototype.fetch = function() {
  var self = this;
  self.members.find({}, { email: 1}).toArray(function(err, docs) {
    if (err) throw '[mongodb] Error fetching members. ' + err;

    self.count = docs.length;
    var i = 0;
    var interId = setInterval(function() {
      var email = docs[i].email;
      
      self.qwerly.services().viaEmail(email, function(err, res) {
        if (err)
          self.emit('error', '[qwerly] Error processing ' + email + '. ' + err.body);
        else if (res.status == 200) {
          self.count++;
          self.members.update(
            { _id: email },
            { $set: { qwerly: res.services } },
            true, function(err, docs) {
              if (err) self.emit('error', '[mongodb] ' + err);
              if (--self.count == 0) self.emit('done');
            });
        }
        if (--self.count == 0) self.emit('done');
      });

      if (++i >= docs.length)
        clearInterval(interId); // end loop
    }, self.QPS);
  });
};
