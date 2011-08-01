var RapLeafAPI = require('node-rapleaf'),
  EventEmitter = process.EventEmitter;

module.exports = RapLeaf;

function RapLeaf(config, db) {
  this.rapleaf = new RapLeafAPI(config.rapleaf.key);
  this.members = db.collection(config.mongodb.collection);
}

RapLeaf.prototype.__proto__ = EventEmitter.prototype;

RapLeaf.prototype.fetch = function() {
  var self = this;
  self.members.find({}, { email: 1 }).toArray(function(err, docs) {
    if (err) throw '[mongodb] Error fetching members. ' + err;

    var arr_emails = []
    for (var i = 0; i < docs.length; ++i)
      arr_emails.push(docs[i].email);

    self.rapleaf.bulk_by_email(arr_emails, function(data, err) {
      data = JSON.parse(data);
      self.count = data.length;
      for (var i = 0; i < data.length; ++i) {
        self.members.update(
          { _id: arr_emails[i] },
          { $set: { rapleaf: data[i] } },
          true, function(err, docs) {
            if (err) self.emit('error', '[mongodb] ' + err);
            if (--self.count == 0) self.emit('done');
          }); 
      }
    });
  });
};
