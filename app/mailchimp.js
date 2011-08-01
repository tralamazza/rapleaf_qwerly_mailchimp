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

Mailchimp.prototype.fetch = function() {
  var self = this;
  self.mchimp.lists(function(data) {
    if (data.error) throw '[Mailchimp] ' + data.error;
    for (var i = 0; i < data.data.length; ++i) {
      var listId = data.data[i].id;
      self.mchimpExp.list({ id: listId }, function(list_data) {
        if (list_data.error) throw '[Mailchimp] ' + list_data.error;
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

// TODO use http://apidocs.mailchimp.com/api/rtfm/listbatchsubscribe.func.php
Mailchimp.prototype.update = function() {
  var self = this;
  self.mchimp.lists(function(data) {
    if (data.error) throw '[Mailchimp] ' + data.error;
    for (var i = 0; i < data.data.length; ++i) {
      var listId = data.data[i].id;
      self.mchimpExp.list({ id: listId }, function(list_data) {
        if (list_data.error) throw '[Mailchimp] ' + list_data.error;
        for (var m = 1; m < list_data.length; ++m) {
          var email = (list_data[m])[0];
          self.members.findOne({ _id: email.toLowerCase() }, function(err, doc) {
            var merge_vars = {
              gravatar: 'http://www.gravatar.com/avatar/' + doc.md5 
            };
            if (doc.qwerly) {
              for (var i = 0; i < doc.qwerly.length; ++i)
                merge_vars[doc.qwerly[i].type] = doc.qwerly[i].url;
            }
            if (doc.rapleaf) {
              for (var k in doc.rapleaf)
                merge_vars[k] = doc.rapleaf[k];
            }
            self.mchimp.listUpdateMember({
              id: listId,
              email_address: email,
              merge_vars: merge_vars
            }, function(data) {
              if (data.error) self.emit('error', '[Mailchimp] ' + data.error);
            });
          });
        }
      });
    }
  });
};
