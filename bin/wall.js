const message = require('./message');
// const volumes = require('./volume').exchange_volumes;
const request = require('request-promise-native');

const alerts = false;
let sensitivity = 2.5; // Minimum 1

let first = {};

let channel_pair = {};

let requestOptions = {
  uri: '',
  headers: {
    'User-Agent': 'Request-Promise'
  },
  json: true
};

let sell_total = {
  "bitfinex": {},
  "binance": {},
  "gdax": {}
};
let buy_total = {
  "bitfinex": {},
  "binance": {},
  "gdax": {}
};

let wall = {
  "bitfinex": {},
  "binance": {},
  "gdax": {}
}

let book = {
  "bitfinex": {},
  "binance": {},
  "gdax": []
};


let min_worth = {
  "BTC": 800000,
  "ETH": 600000,
  "EOS": 500000,
  "LTC": 400000
}
// let min_worth = {
//   "BTC": 0,
//   "ETH": 0,
//   "EOS": 0,
//   "LTC": 0
// }

const updateBook = (key, option) => {
  // sell_total = 0;
  // buy_total = 0;
  if(buy_total.bitfinex[key] == undefined)
  buy_total.bitfinex[key] = 0;
  if(sell_total.bitfinex[key] == undefined)
  sell_total.bitfinex[key] = 0;
  book.bitfinex[key].forEach((pricePoint) => {
    if(pricePoint[2] > 0 && option != "sell") {
      buy_total.bitfinex[key] += pricePoint[2];
    } else if(pricePoint[2] < 0 && option != "buy") {
      sell_total.bitfinex[key] += Math.abs(pricePoint[2]);
    }
  });
}

const compare = (a, b) => {
  if(typeof a == "string" && typeof b == "string")
    return parseFloat(a[0]) - parseFloat(b[0]);
  else
    return a[0] - b[0];
}

const saveBook = () => {
  ["BTCUSDT", "EOSUSDT", "ETHUSDT"].forEach((symbol) => {
    first[symbol] = true;
    requestOptions.uri = `https://www.binance.com/api/v1/depth?symbol=${symbol}&limit=10`;
    
    request(requestOptions)
    .then((data) => {
      book.binance[symbol] = {};
      book.binance[symbol].lastUId = data.lastUpdateId;
      book.binance[symbol].bids = data.bids;
      book.binance[symbol].asks = data.asks;
      book.binance[symbol].bids.sort(compare);
      book.binance[symbol].asks.sort(compare);

      buy_total.binance[symbol] = 0;
      sell_total.binance[symbol] = 0;

      book.binance[symbol].bids.forEach((pricePoint) => {
        buy_total.binance[symbol] += parseFloat(pricePoint[1]);
      });
      
      book.binance[symbol].asks.forEach((pricePoint) => {
        sell_total.binance[symbol] += parseFloat(pricePoint[1]);
      })

      ready = true;
    }).catch((err) => {console.log("Binance Order book: ", err.message)});

    wall.binance[symbol] = {
      sell: false,
      buy: false
    };
  });
}

saveBook();

const bitfinex = (order) => {
  let channel_id = -1;
  if(order.chanId) {
    channel_id = order.chanId;
    channel_pair[channel_id] = order.pair;
  } 
  else if(typeof order[0] == "number" && channel_pair[order[0]]) {
    channel_id = order[0];
    if(order[1] != undefined && typeof order[1][0] == "number" && order[1].length == 3) {
      let quantity = order[1][2];
      let absQuant = Math.abs(quantity);
      let symbol = channel_pair[channel_id];
      let currency = symbol.substring(0, 3);
      let count = order[1][1];
      let price = order[1][0];
      let index = book.bitfinex[channel_id].findIndex(x => x[0] == price);
      if(count > 0) {
        if(index != -1) {
          if(book.bitfinex[channel_id][index][2] > 0)
          buy_total.bitfinex[channel_id] -= book.bitfinex[channel_id][index][2];
          else
          sell_total.bitfinex[channel_id] += book.bitfinex[channel_id][index][2];
          book.bitfinex[channel_id][index] = [price, count, quantity];
        } else {
          book.bitfinex[channel_id].push([price, count, quantity]);
          book.bitfinex[channel_id].sort(compare);
        }
        if(quantity > 0)
        buy_total.bitfinex[channel_id] += quantity;
        else
        sell_total.bitfinex[channel_id] += absQuant;
      } 
      else if(count == 0 && index != -1) {
        if(book.bitfinex[channel_id][index][2] > 0)
        buy_total.bitfinex[channel_id] -= book.bitfinex[channel_id][index][2];
        else
        sell_total.bitfinex[channel_id] += book.bitfinex[channel_id][index][2];
        book.bitfinex[channel_id].splice(index, 1);
      }
      // quantity > 0 ? updateBook(channel_id, "buy") : updateBook(channel_id, "sell");
      // updateBook(channel_id);
      let s_total = sell_total.bitfinex[channel_id];
      let b_total = buy_total.bitfinex[channel_id];
      if((s_total*price > min_worth[currency]) || (b_total*price > min_worth[currency])) {
        let sb_ratio = s_total/b_total;
        let messageObj = {
          event: "VOLUME",
          side: "",
          symbol,
          size: 0,
          exchange: "Bitfinex"
        }
        if(sb_ratio > sensitivity && (!wall.bitfinex[channel_id].sell)) { // || sb_ratio > wall.bitfinex[channel_id].sell)) {
          messageObj.side = "Sell";
          messageObj.quantity = s_total;
          messageObj.size = sb_ratio;
          wall.bitfinex[channel_id] = {
            sell: sb_ratio,
            buy: false
          };
          if(alerts)
            message(messageObj);
        }
        else if((1/sb_ratio) > sensitivity && (!wall.bitfinex[channel_id].buy)) { // || (1/sb_ratio) > wall.bitfinex[channel_id].buy)) {
          messageObj.side = "Buy";
          messageObj.size = 1/sb_ratio;
          messageObj.quantity = b_total;
          wall.bitfinex[channel_id] = {
            sell: false,
            buy: 1/sb_ratio
          };
          if(alerts)
            message(messageObj);
        } 
        if(wall.bitfinex[channel_id].sell && sb_ratio < sensitivity && sb_ratio >= 1) {
          wall.bitfinex[channel_id].sell = false;
          // console.log(symbol+" sell volume decreased");
          messageObj.event = "WD";
          messageObj.side = "Sell";
          if(alerts)
          message(messageObj);
        }
        if(wall.bitfinex[channel_id].buy && 1/sb_ratio < sensitivity && 1/sb_ratio >= 1) {
          wall.bitfinex[channel_id].buy = false; 
          // console.log(symbol+" buy volume decreased");
          messageObj.event = "WD";
          messageObj.side = "Buy";
          if(alerts)
          message(messageObj);
        }
      }
    } else if(typeof order[1] != "string" && order[1][0][0] != undefined) {
      book.bitfinex[channel_id] = order[1];
      wall.bitfinex[channel_id] = {
        sell: false,
        buy: false
      };
      updateBook(channel_id);
    }
  }
  
}

const binance = (order) => {
  let symbol = order.s;
  let currency = symbol.substring(0, 3);
  let U = order.U;
  let u = order.u;
  let bids = order.b;
  let asks = order.a;
  
  if(book.binance[symbol] != undefined && u >= book.binance[symbol].lastUId + 1 
      && (first[symbol] || U == book.binance[symbol].lastUId + 1)) {
    first[symbol] = false;
    bids.forEach((pricePoint) => {
      let index = book.binance[symbol].bids.findIndex(x => x[0] == pricePoint[0]);
      if(index != -1) {
        buy_total.binance[symbol] -= parseFloat(book.binance[symbol].bids[index][1]);
        if(parseFloat(pricePoint[1]) != 0) {
          book.binance[symbol].bids[index][1] = pricePoint[1];
          buy_total.binance[symbol] += parseFloat(pricePoint[1]);
        } else {
          book.binance[symbol].bids.splice(index, 1);
        }
      } 
      else if(parseFloat(pricePoint[1]) != 0) {
        book.binance[symbol].bids.push(pricePoint);
        book.binance[symbol].bids.sort(compare);
        buy_total.binance[symbol] += parseFloat(pricePoint[1]);
        if(book.binance[symbol].bids.length > 10) {
          buy_total.binance[symbol] -= parseFloat(book.binance[symbol].bids[0][1]);
          book.binance[symbol].bids.splice(0, 1);
        }
      }    
    });
    
    asks.forEach((pricePoint) => {
      let index = book.binance[symbol].asks.findIndex(x => x[0] == pricePoint[0]);
      if(index != -1) {
        sell_total.binance[symbol] -= parseFloat(book.binance[symbol].asks[index][1]);
        if(parseFloat(pricePoint[1]) != 0) {
          book.binance[symbol].asks[index][1] = pricePoint[1];
          sell_total.binance[symbol] += parseFloat(pricePoint[1]);
        } else {
          book.binance[symbol].asks.splice(index, 1);
        }
      } 
      else if(parseFloat(pricePoint[1]) != 0) {
        book.binance[symbol].asks.push(pricePoint);
        book.binance[symbol].asks.sort(compare);
        sell_total.binance[symbol] += parseFloat(pricePoint[1]);
        if(book.binance[symbol].asks.length > 10) {
          sell_total.binance[symbol] -= parseFloat(book.binance[symbol].asks[10][1]);
          book.binance[symbol].asks.splice(10, 1);
        }
      }
    
    });

    book.binance[symbol].lastUId = u;
    
    let s_total = sell_total.binance[symbol];
    let b_total = buy_total.binance[symbol];
    let med_bPrice = parseFloat(book.binance[symbol].bids[book.binance[symbol].bids.length-1][0]);
    let med_aPrice = parseFloat(book.binance[symbol].asks[0][0]);
    // console.log(symbol, s_total, b_total);
    // console.log(book.binance[symbol]);
    if((s_total*med_aPrice > min_worth[currency]) || (b_total*med_bPrice > min_worth[currency])) {
      let sb_ratio = s_total/b_total;
      let messageObj = {
        event: "VOLUME",
        side: "",
        symbol,
        size: 0,
        exchange: "Binance"
      }
      if(sb_ratio > sensitivity && (!wall.binance[symbol].sell)) { // || sb_ratio > wall.binance[symbol].sell)) {
        // console.log("sell:", symbol, sb_ratio, s_total+"/"+b_total);
        // console.log(book.binance[symbol]);
        messageObj.side = "Sell";
        messageObj.size = sb_ratio;
        messageObj.quantity = s_total;
        wall.binance[symbol] = {
          sell: sb_ratio,
          buy: false
        };
        if(alerts)
          message(messageObj);
      }
      else if((1/sb_ratio) > sensitivity && (!wall.binance[symbol].buy)) { // || (1/sb_ratio) > wall.binance[symbol].buy)) {
        // console.log("buy:",symbol, 1/sb_ratio, s_total+"/"+b_total);
        // console.log(book.binance[symbol]);
        messageObj.side = "Buy";
        messageObj.size = 1/sb_ratio;
        messageObj.quantity = b_total;
        wall.binance[symbol] = {
          sell: false,
          buy: 1/sb_ratio
        };
        if(alerts)
          message(messageObj);
      } 
      if(wall.binance[symbol].sell && sb_ratio < sensitivity && sb_ratio >= 1) {
        // console.log(symbol+" sell volume decreased");
        wall.binance[symbol].sell = false;
        messageObj.event = "WD";
        messageObj.side = "Sell";
        if(alerts)
        message(messageObj);
      }
      if(wall.binance[symbol].buy && 1/sb_ratio < sensitivity && 1/sb_ratio >= 1) {
        // console.log(symbol+" buy volume decreased");
        wall.binance[symbol].buy = false; 
        messageObj.event = "WD";
        messageObj.side = "Buy";
        if(alerts)
        message(messageObj);
      }
    }
    
  }
  
}

module.exports = {bitfinex, binance};