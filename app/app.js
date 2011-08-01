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

// globals
var db = new mongodb.db(config.mongodb.host, config.mongodb.port, config.mongodb.db);
  mailchimp = new Mailchimp(config, db);
  qwerly = new Qwerly(config, db),
  rapleaf = new RapLeaf(config, db);

var scrub_done = 2; // querly and rapleaf

// register events
mailchimp.on('error', function(err) {
  console.log('|mailchimp| ' + err);
});
mailchimp.on('done', function() {
  console.log('mailchimp done!');
  qwerly.fetch();
  rapleaf.fetch();
});

qwerly.on('error', function(err) {
  console.log('|qwerly| ' + err);
});
qwerly.on('done', function() {
  console.log('qwerly done!');
  if (--scrub_done == 0) mailchimp.update();
});

rapleaf.on('error', function(err) {
  console.log('|rapleaf| ' + err);
});
rapleaf.on('done', function() {
  console.log('rapleaf done!');
  if (--scrub_done == 0) mailchimp.update();
});

// Go!
mailchimp.fetch();
