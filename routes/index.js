var express = require('express');
var router = express.Router();
let trade = require('../bin/trade');
let message = require('../bin/message');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Whale Tracker', min: trade.min_cost, portion: trade.portion_size});
});

router.post('/', function(req, res) {
  let messageObj = {
    event: 'limit-change',
  }
  message(messageObj);

  if(req.body.btc > 35000)
    trade.min_cost["BTC"] = req.body.btc;
  if(req.body.ltc > 35000)
    trade.min_cost["LTC"] = req.body.ltc;
  if(req.body.eos > 35000)
    trade.min_cost["EOS"] = req.body.eos;
  if(req.body.eth > 35000)
    trade.min_cost["ETH"] = req.body.eth;

  trade.portion_size = req.body.portion / 100;

  res.redirect("/");
});

module.exports = router;
