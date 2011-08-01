/*
 * Author: Daniel Tralamazza <tralamazza@gmail.com>
 */

var crypto = require('crypto'),
  mailchimp = require('mailchimp'),
  EventEmitter = process.EventEmitter,
  inspect = require('sys').inspect;

module.exports = Mailchimp;

function Mailchimp(config, db) {
  this.mchimp = new mailchimp.MailChimpAPI(config.mailchimp.key); // MailChimp API
  this.mchimpExp = new mailchimp.MailChimpExportAPI(config.mailchimp.key); // MailChimp Export API
  this.members = db.collection(config.mongodb.collection); // mongodb collection
  this.db = db; // mongodb database
}

// extend from EventEmitter
Mailchimp.prototype.__proto__ = EventEmitter.prototype;

// fetch and store all emails from all the lists
Mailchimp.prototype.fetch = function() {
  var self = this;

  self.mchimp.lists(function(data) { // fetch all mailchimp lists
    self.count = 0;
    if (data.error) throw '[Mailchimp] ' + data.error;

    for (var i = 0; i < data.data.length; ++i) { // for each list
      var listId = data.data[i].id; // list id

      self.mchimpExp.list({ id: listId}, function(list_data) { // fetch a particular list
        if (list_data.error) self.emit ('error', '@fetch ' + inspect(list_data.error));
        self.count += list_data.length - 1; // 1st row is the header

        for (var m = 1; m < list_data.length; ++m) { // for each member in list
          var member = list_data[m];
          var email = member[0].toLowerCase(); // normalize the email
          var md5sum = crypto.createHash('md5'); // md5(email)
          md5sum.update(email);
          // mongodb update (or insert)
          self.members.update(
            { _id: email }, // email is unique
            { $set: {
                email: email,
                firstname: member[1],
                lastname: member[2],
                md5: md5sum.digest('hex')
              },
              $addToSet: {
                in_list: listId
              }
            },
            true, // 'upsert' (insert if not found)
            function(err, docs) {
              if (err) self.emit('error', '@fetch ' + inspect(err));
              if (--self.count == 0) self.emit('fetch', 'fetch');
            }); // self.members.update
        }
      }); // self.mchimpExp.list
    }
  }); // self.mchimp.lists
};

// generates a mongodb collection containing unique field names per list (and their frequency)
Mailchimp.prototype.uniqueTags = function() {
  var self = this;
  // output collection
  var out_col = self.db.collection(self.members.name() + '.unique_tags');
  self.members.mapReduce(function() { // MAP
    var htags = { 'gravatar': 1 }; // build a tag list
    // qwerly field names
    if (this.qwerly) {
      for (var i = 0; i < this.qwerly.length; ++i) {
        htags['Q' + this.qwerly[i].type] = 1; // concat to avoid name clash
      }
    }
    // rapleaf field names
    if (this.rapleaf) {
      for (var k in this.rapleaf) {
        switch (typeof this.rapleaf[k]) { // ignore complex fields
          case 'string':
          case 'number':
            htags['R' + k] = 1; // concat to avoid name clash
        }
      }
    }
    // emit once per list
    for (var j = 0; j < this.in_list.length; ++j) {
      emit(this.in_list[j], { tags: htags });
    }
  }, function(key, values) { // REDUCE
    var utags = {};
    for (var i = 0; i < values.length; ++i) {
      var vitags = values[i].tags;
      for (var t in vitags) {
        if (utags[t])
          utags[t] += vitags[t];
        else
          utags[t] = vitags[t];
      }
    }
    return { tags: utags };
  }, { // OPTIONS
    out: out_col.name()
  }, function(err) { // RESULT
    if (err)
      self.emit('error', '@uniqueTags ' + inspect(err));
    else {
      out_col.find().toArray(function(err, data) {
        if (err)
          self.emit('error', '@uniqueTags ' + inspect(err));
        else
          self.emit('uniqueTags', data);
      });
    }
  });
};

// normalize tag: no spaces, clamped to 10 chars and upcased
function normTag(s) { return s.replace(/ /g, '').substr(0, 10).toUpperCase(); }

// add merge variables
Mailchimp.prototype.updateVars = function(utags) {
  var self = this;

  for (var i = 0; i < utags.length; ++i) { // for every computed list
    var utag = utags[i];

    self.mchimp.listMergeVars({ id: utag._id}, function(list_vars) { // fetch merge vars
      if (list_vars.error) self.emit('error', '@updateVars ' + inspect(list_vars.error));

      var list_vars_tags = {};
      for (var j = 0; j < list_vars.length; ++j) {
        list_vars_tags[list_vars[j].tag] = list_vars[j]; // fill tag list
      }

      for (var t in utag.value.tags) { // for each unique field name we have found for this list
        var t_label = t.substr(1); // remove 1st char
        var ntag = normTag(t);
        if (list_vars_tags[ntag] === undefined) {
          list_vars_tags[ntag] = t;
          self.mchimp.listMergeVarAdd({
            id: utag._id, // listId
            tag: ntag, // tag
            name: t_label, // label
            options: {
              field_type: (t[0] == 'Q') ? 'url' : 'text' // qwerly fields are URL
            }
          }, function(var_add) {
            if (var_add.error) self.emit('error', '@updateVars ' + inspect(var_add.error));
          }); // self.mchimp.listMergeVarAdd
        }
      }

    }); // self.mchimp.listMergeVars
  }
};

// TODO use http://apidocs.mailchimp.com/api/rtfm/listbatchsubscribe.func.php
// upload email related data as merge variables
Mailchimp.prototype.update = function() {
  var self = this;
  
  self.mchimp.lists(function(data) { // fetch all mailchimp lists
    if (data.error) throw '[Mailchimp] ' + data.error;

    for (var i = 0; i < data.data.length; ++i) { // for each list
      var listId = data.data[i].id; // list id

      self.mchimpExp.list({ id: listId }, function(list_data) { // fetch list
        if (list_data.error) self.emit('error', '@update ' + inspect(list_data.error));
        self.count += list_data.length - 1; // 1st row is the header

        for (var m = 1; m < list_data.length; ++m) {
          var email = (list_data[m])[0];

          self.members.findOne({ _id: email.toLowerCase() }, function(err, doc) {
            var merge_vars = { };
            merge_vars[normTag('gravatar')] = 'http://www.gravatar.com/avatar/' + doc.md5;
            if (doc.qwerly) { // qwerly tags are prefixed by 'Q'
              for (var i = 0; i < doc.qwerly.length; ++i) {
                merge_vars[normTag('Q' + doc.qwerly[i].type)] = doc.qwerly[i].url;
              }
            }
            if (doc.rapleaf) { // rapleaf tags are prefixed by 'RL'
              for (var k in doc.rapleaf) {
                switch (typeof doc.rapleaf[k]) {
                  case 'string':
                  case 'number':
                    merge_vars[normTag('R' + k)] = doc.rapleaf[k];
                }
              }
            }
            // update member merge vars
            self.mchimp.listUpdateMember({
              id: listId,
              email_address: doc._id,
              merge_vars: merge_vars
            }, function(data) {
              if (data.error) self.emit('error', '@update ' + data.error);
            }); // self.mchimp.listUpdateMember
          }); // self.members.findOne
        }
      }); // self.mchimpExp.list
    }
  }); // self.mchimp.lists
};
