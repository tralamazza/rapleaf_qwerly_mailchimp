/*
 * Author: Daniel Tralamazza <tralamazza@gmail.com>
 *
 * ODesk job: https://www.odesk.com/jobs/~~efe1487b37957df1
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

// register events
mailchimp.on('error', function(err) {
  console.log('|mailchimp| ' + err);
});
mailchimp.on('done', function() {
  console.log('mailchimp done!');
  qwerly.run();
  rapleaf.run();
});

qwerly.on('error', function(err) {
  console.log('|qwerly| ' + err);
});
qwerly.on('done', function() {
  console.log('qwerly done!');
});

rapleaf.on('error', function(err) {
  console.log('|rapleaf| ' + err);
});
rapleaf.on('done', function() {
  console.log('rapleaf done!');
});

// Go!
mailchimp.run();
