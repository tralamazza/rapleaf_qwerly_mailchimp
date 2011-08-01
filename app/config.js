/*
 * Config
 */

module.exports = {
  mailchimp: {
    key: ""
  },
  rapleaf: {
    key: ""
  },
  qwerly: {
    key: "",
    cps: 2,
    cpm: 1000
  },
  mongodb: {
    host: "localhost",
    port: 27017,
    db: 'rapleaf_qwerly_mailchimp',
    collection: 'members'
  }
};
