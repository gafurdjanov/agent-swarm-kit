import { getExchangeInfo } from "../utils/getExchangeInfo";
import { getPrice } from "../utils/getPrice";
import { roundTicks } from "../utils/roundTicks";
import { usdToCoins } from "../utils/usdToCoins";

const TRADE_BUY_LOWER_PERCENT = 1.001;

export const calculateBuyUSDT = async (total: number, coin = "BTC") => {
    const symbol = `${coin}USDT`;
    const { stepSize } = await getExchangeInfo(symbol, 'LOT_SIZE');
    const { tickSize } = await getExchangeInfo(symbol, 'PRICE_FILTER');
    const averagePrice = await getPrice(symbol);
    const price = roundTicks(averagePrice * TRADE_BUY_LOWER_PERCENT, tickSize);
    const quantity = roundTicks(usdToCoins(total, Number(price)), stepSize);
    return {
        quantity: String(quantity), 
        price: String(price),
    };
}
