const { WebcastPushConnection, signatureProvider } = require('tiktok-live-connector');

// signatureProvider.signEvents.on('signSuccess', (data) => console.log(data));

// signatureProvider.config.signProviderHost = "http://tiktok-sign-private-timech.zerody.one:52568/";
// signatureProvider.config.extraParams.apiKey = "NTFiNzczZTU1ZmQyMjZhMzhjNDZlYmUxMDlkNTNkMWUzNDExMDNiNjZiOWY1ZjI0ZGY3Yjlh";

// Username of someone who is currently live
let tiktokUsername = "ayhiefachri";



// Create a new wrapper object and pass the username
let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);

// Connect to the chat (await can be used as well)
tiktokLiveConnection.connect().then(state => {
    console.info(`Connected to roomId ${state.roomId}`);
}).catch(err => {
    console.error('Failed to connect', err);
})

// Define the events that you want to handle
// In this case we listen to chat messages (comments)
tiktokLiveConnection.on('chat', data => {
    console.log(`${data.uniqueId} (userId:${data.userId}) writes: ${data.comment}`);
})

// And here we receive gifts sent to the streamer
tiktokLiveConnection.on('gift', data => {
    console.log(`${data.uniqueId} (userId:${data.userId}) sends ${data.giftId}`);
})

tiktokLiveConnection.on('error', err => {
    console.error('Error', err);
})
