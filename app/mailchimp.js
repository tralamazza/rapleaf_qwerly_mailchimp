var crypto = require('crypto'),
  mailchimp = require('mailchimp'),
  EventEmitter = process.EventEmitter;

module.exports = Mailchimp;

function Mailchimp(config, db) {
  this.mchimp = new mailchimp.MailChimpAPI(config.mailchimp.key);
  this.mchimpExp = new mailchimp.MailChimpExportAPI(config.mailchimp.key);
  this.members = db.collection(config.mongodb.collection);
}

Mailchimp.prototype.__proto__ = EventEmitter.prototype;

Mailchimp.prototype.run = function() {
  var self = this;
  self.mchimp.lists(function(data) {
    for (var i = 0; i < data.data.length; ++i) {
      var listId = data.data[i].id;
      self.mchimpExp.list({ id: listId }, function(list_data) {
        self.count = list_data.length - 1;
        for (var m = 1; m < list_data.length; ++m) {
          var member = list_data[m];
          var email = member[0].toLowerCase();
          var md5sum = crypto.createHash('md5');
          md5sum.update(email);
          self.members.update(
            { _id: email },
            { $set: {
                email: email,
                firstname: member[1],
                lastname: member[2],
                md5: md5sum.digest('hex')
              }
            },
            true,
            function(err, docs) {
              if (err) self.emit('error', '[mongodb] ' + err);
              if (--self.count == 0) self.emit('done');
            });
        }
      });
    }
  });
};
