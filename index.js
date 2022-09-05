import express from 'express'
import cors from 'cors'
import bodyparser from 'body-parser'
import server from './routes/server.js'

const API_PORT = 3002;
const app = express();

app.use(cors());
app.use(bodyparser.urlencoded({extended:false}));
app.use(bodyparser.json({limit:'200mb'}));
server(app);

app.listen(API_PORT, '0.0.0.0', ()=>{
  console.log(`Listening on Port ${API_PORT}`)
})