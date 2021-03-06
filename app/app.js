/*
 * Author: Daniel Tralamazza <tralamazza@gmail.com>
 *
 * Got the idea from this ODesk job: https://www.odesk.com/jobs/~~efe1487b37957df1
 * 
 * Description:
 *   1. Pull list from mailchimp
 *   2. Connect the two scrubbing APIs (qwerly / rapleaf)
 *   3. Request (full name, social profiles, demographics, address location, gender, income, education, occupation, gravatar)
 *   4. Store this in mailchimp & in a sql database
 *
 * Changes:
 *   1. MongoDB instead of SQL
 */

// requires
var config = require('./config'),
  mongodb = require('mongodb-wrapper'),
  Mailchimp = require('./mailchimp'),
  Qwerly = require('./qwerly'),
  RapLeaf = require('./rapleaf');


// check keys
['mailchimp', 'qwerly', 'rapleaf'].forEach(function(i) {
  if (config[i].key == '')
    return 'Missing ' + i + ' API key. Please change `config.js`';
});

// globals
var db = new mongodb.db(config.mongodb.host, config.mongodb.port, config.mongodb.db);
  mailchimp = new Mailchimp(config, db);
  qwerly = new Qwerly(config, db),
  rapleaf = new RapLeaf(config, db);


var scrub_done = 2; // querly and rapleaf, last to complete fires the update

// register events
mailchimp.on('error', function(err) {
  console.log('|mailchimp| ' + err);
});
mailchimp.on('fetch', function() {
  console.log('mailchimp fetch done!');
  qwerly.fetch();
  rapleaf.fetch();
});
mailchimp.on('uniqueTags', function(utags) {
  console.log('mailchimp uniqueTags done!');
  mailchimp.updateVars(utags);
  mailchimp.update();
});
mailchimp.on('update', function() {
  console.log('mailchimp update done!');
});

qwerly.on('error', function(err) {
  console.log('|qwerly| ' + err);
});
qwerly.on('fetch', function() {
  console.log('qwerly fetch done!');
  if (--scrub_done == 0) mailchimp.uniqueTags();
});

rapleaf.on('error', function(err) {
  console.log('|rapleaf| ' + err);
});
rapleaf.on('fetch', function() {
  console.log('rapleaf fetch done!');
  if (--scrub_done == 0) mailchimp.uniqueTags();
});

// ### Starts here ###
db[config.mongodb.collection].drop(function(err) { // clear our cache db
  mailchimp.fetch(); // go!
});
