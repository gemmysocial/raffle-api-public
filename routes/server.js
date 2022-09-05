import express from 'express'
import * as anchor from '@project-serum/anchor'
import * as web3 from "@solana/web3.js"
import * as mysql from 'mysql'
import timestamp from 'unix-timestamp'
import { nanoid } from 'nanoid'
import * as cardinal from '@cardinal/staking'
import moment from 'moment'
import dotenv from 'dotenv'
import axios from 'axios'

dotenv.config()


const pool = mysql.createPool({
    connectionLimit:process.env.DB_CONNECTION_LIMIT,
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_MAIN_SCHEMA
})


const app = express()

const connection = new anchor.web3.Connection(process.env.QUICKNDOE_RPC_ADDRESS)

// Public key of the token contract
const TOKEN_PUBKEY = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const marketplace_wallets = ['1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix','F4ghBzHFNgJxV4wEQDchU5i7n4XWWMBSaq7CuswGiVsr','BjaNzGdwRcFYeQGfuLYsc1BbaNRG1yxyWs1hZuGRT8J2','GUfCR9mK6azb9vcpsxgXyj7XRPAKJd4KMHTTVvtncGgp','3D49QorJyNaL4rcpiynbuS3pRH4Y7EXEM6v6ZGaqfFGK','5VhjZ9GiPi1bAWcPeM4fxKCs3A4ien7Yd8oL6p8KxUZY']


const marketplace_holding_wallets = {
    'ME1': '1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix' ,
    'ME2': 'GUfCR9mK6azb9vcpsxgXyj7XRPAKJd4KMHTTVvtncGgp',
    'Solsea': 'uZq7Vx2inbr48X3GxSEEnHzdykGK4naN5EyMkGJE1KG',
    "digital_eyes": "F4ghBzHFNgJxV4wEQDchU5i7n4XWWMBSaq7CuswGiVsr",
    "exchange_art": "BjaNzGdwRcFYeQGfuLYsc1BbaNRG1yxyWs1hZuGRT8J2",
    "solanart": "3D49QorJyNaL4rcpiynbuS3pRH4Y7EXEM6v6ZGaqfFGK",

}

const marketplace_delegate_wallets = {
    "OpenSea":'HS2eL9WJbh7pA4i4veK3YDwhGLRjY3uKryvG1NbHRprj',
}

function sleep(ms) {
    return new Promise((resolve) => 
    {
      setTimeout(resolve, ms);});
};

function writeChild(data) {
    let writeQuery = 'INSERT INTO ?? (??,??,??,??,??,??,??) VALUES(?,?,?,?,?,?,?)';
    let query = mysql.format(writeQuery,['raffledraw_info','raffle_time','raffle_id','raffled_project','selected_wallets','selected_tokens','uneligible_wallets','raffle_type',data.time,data.id,data.project_name, data.selected_wallets,data.selected_tokens,data.excluded,data.raffle_type])
    pool.query(query,(err,data)=>{
        if(err){
            console.error(err)
        }
    });
};

function sql_checkid(raffle_id){
    return new Promise((resolve,reject)=>{
        let writeQuery = "SELECT * FROM ?? WHERE raffle_id = ? "
        let query = mysql.format(writeQuery,['raffledraw_info', raffle_id])
        pool.query(query,(err,results)=>{
            return err ? reject(err): resolve(results[0]);
        })

    })

    
}

async function cardinal_staking(staking_pool,num_winners,project_name,json_body){
    //need to make this api work so that it can include all the require winners so while [winner_length < ]
    let winner_owner = []
    let winner_mint = []
    let web3_staking_pubkey = new web3.PublicKey(staking_pool)
    let data = await cardinal.stakePool.accounts.getActiveStakeEntriesForPool(connection,web3_staking_pubkey)
    let exclusion_list = json_body.exclusion

    while(winner_mint.length < num_winners){
        try{
            let rng_index = Math.floor((Math.random() * data.length)+1);
            if(exclusion_list.includes(data[rng_index]['parsed']['lastStaker'].toBase58()) !=true){
                if(winner_owner.includes(data[rng_index]['parsed']['lastStaker'].toBase58()) !=true){
                    winner_owner.push(data[rng_index]['parsed']['lastStaker'].toBase58())
                    winner_mint.push(data[rng_index]['parsed']['originalMint'].toBase58())}
                }
        }catch(err){
            console.log('Error while trying to get Winners from cardinal_staking' + err)
        }
    }
    const drawId = nanoid(10)
    const time = timestamp.now('0s').toString()
    // Add SQL Query
    const sql_data = {
        "time": time,
        'id': drawId,
        'raffle_type':'cardinal_staking',
        'project_name': project_name.toString(),
        'selected_tokens':winner_mint.toString(),
        'selected_wallets':winner_owner.toString(),
        'excluded': exclusion_list.toString()
    }
    try{
        writeChild(sql_data)
    }catch(err){
        console.log('Failed to write results to database' + err)
    }

    return({
        draw_id: drawId,
        project_name: project_name.toString(),
        status: 'Completed',
        raffle_type: 'staking',
        tokens: winner_mint,
        walllets: winner_owner,
        time: time
    })

}

async function getNFTInfo(mint_address){
// Parameter
// mint_address: mint_address of NFT
// Returns a json object: if ['delegated'] is present then it's probably listed on opensea, else if owner_address is one of the ones listed above, then it's probably listed on another exchnage
        let filter1 = {
            memcmp:{
                offset:0,
                bytes: mint_address,
            },
        }
        
        let filter2 = {
            dataSize:165, 
        }
        let getFilter = [filter1,filter2]
        let programAccountsConfig = { filters: getFilter, encoding: "jsonParsed" };

        try {
            var nft_data_unfiltered  = await connection.getParsedProgramAccounts(TOKEN_PUBKEY,programAccountsConfig)
            var nft_data = nft_data_unfiltered[0]['account']['data']['parsed']['info']

        } catch(err){
            console.log('Error while using connection.getParsedProgramAccounts on getNFTInfo: '+ err)
        }
    
        return nft_data

        
    }


async function marketplace_filter(mint_address){
    const data = await getNFTInfo(mint_address)
    
    try{
        if(Object.values(marketplace_holding_wallets).indexOf(data['owner'])>-1 || Object.values(marketplace_delegate_wallets).indexOf(data['delegate'])>-1){
            return false
        } else if(data['tokenAmount']['amount'] == 0){
            return false
        }else{
            return true
        }

    }catch(err){
        console.log('Error has occured on marketplace_filter: ' + err)

    }

}

async function getNFTsInWallet(mint_address, hashlist){
    let count = 0
    // Parameter
    // mint_address: mint_address of NFT
    // Returns a json object: if ['delegated'] is present then it's probably listed on opensea, else if owner_address is one of the ones listed above, then it's probably listed on another exchnage
            let filter1 = {
                memcmp:{
                    offset:32,
                    bytes: mint_address,
                },
            }
            
            let filter2 = {
                dataSize:165, 
            }
            let getFilter = [filter1,filter2]
            let programAccountsConfig = { filters: getFilter, encoding: "jsonParsed" };
    
            try {
                var nft_data_unfiltered  = await connection.getParsedProgramAccounts(TOKEN_PUBKEY,programAccountsConfig)
    
            } catch(err){
                console.log('Error while using connection.getParsedProgramAccounts on getNFTsinWallet: '+ err)
            }
            
            for(let i=0; i<nft_data_unfiltered.length; i++){
                console.log(i)
                if(hashlist.includes(nft_data_unfiltered[i]['account']['data']['parsed']['info']['mint']) && nft_data_unfiltered[i]['account']['data']['parsed']['info']['tokenAmount']['amount'] == 1 ){
                    let m_filter = await marketplace_filter(nft_data_unfiltered[i]['account']['data']['parsed']['info']['mint'])
                    if(m_filter == true){
                        count ++
                    }else{
                        count =0 
                        break
                    }
                }
            }
            console.log(count)
            return(count)
    
            
        }


async function noStaking_drawWinners(num_winners,json_body,num_nfts_held,project_name){

    const mint_address = []
    const selected_wallets = []
    const excluded_numbers = []
    const excluded_wallets = []
    const winner_numbers = []
    const winner_data = []
    const name = project_name

    excluded_wallets.push(json_body.exclusion)
    const json_list = json_body.hashlist

   while(selected_wallets.length <= num_winners-1){
    let rng_index = Math.floor((Math.random() * json_list.length)+1);
    let data = await getNFTInfo(json_list[rng_index])
    if(excluded_wallets.includes(json_list[data['owner']]) != true && excluded_numbers.includes(rng_index)!= true){
        try{
            let m_filter = await marketplace_filter(data['mint'])
            if(m_filter==false){
                excluded_numbers.push(rng_index)
                excluded_wallets.push(data['owner'])
                sleep(100)
            }else{
                const number_of_nfts = await getNFTsInWallet(data['owner'],json_list)
                if(number_of_nfts >= num_nfts_held){
                    if (selected_wallets.includes(data['owner']) != true){
                        selected_wallets.push(data['owner'])
                        mint_address.push(data['mint'])
                        winner_data.push(data)
                        winner_numbers.push(rng_index)
                        sleep(100)
                    }
                }else{
                    excluded_numbers.push(rng_index)
                    excluded_wallets.push(data['owner'])
                    sleep(100)
                }
            }
        }catch(err){
            console.log(err)
        }

    }
   }
   const drawId = nanoid(10)
   const time = timestamp.now('0s').toString()
   const sql_data = {
        "time":time,
        'id': drawId,
        'raffle_type':'non_staking',
        'project_name':name.toString(),
        'selected_tokens':mint_address.toString(),
        'selected_wallets':selected_wallets.toString(),
        'excluded': excluded_wallets.toString()
    }

    try{
        console.log(name)
        writeChild(sql_data)
    }catch(err){
        console.log('Failed to write results to database' + err)

    }

    return({
      draw_id: drawId,
      project_name: name.toString(),
      status: 'Completed',
      raffle_type: 'non_staking',
      tokens: mint_address,
      walllets: selected_wallets,
      time: time
    })
}

export default app=> {
    app.get('/', async(req,res)=>{
      res.json({message: 'Raffle API'})
    })

    app.post('/nostaking_drawWinners',async(req,res)=>{
        if (!req.query.project_name) {
            return res.status(422).send({message: 'Project name is required!'})
        }

        if (!req.query.num_winners || req.query.num_winners < 1) {
            return res.status(422).send({message: 'Please provide how many winners.'})
        }

        const captcha = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: req.body.captcha}).toString()
        )

        if (!captcha.data.success) {
          return res.status(422).send({message: 'Captcha invalid!'})
        }

        let json_body = req.body
        let draw = await noStaking_drawWinners(req.query.num_winners,json_body,req.query.num_nfts_held,req.query.project_name)
        const winnersData = []
        const tokenData = []

        for (let wallet of draw.walllets) {
          winnersData.push({
            id: draw.walllets.indexOf(wallet),
            wallet: wallet,
            action: 'copy'
          })
        }

        for (let token of draw.tokens) {
            tokenData.push({
              id: draw.tokens.indexOf(token),
              token: token,
              action: 'open'
            })
        }

        const data = {
          draw_id: draw.draw_id,
          project_name: draw.project_name,
          status: draw.status,
          raffle_type: draw.raffle_type,
          date: moment.unix(draw.time).format('MM/DD/YYYY HH:mm:ss'),
          tokens: tokenData,
          winners: winnersData,
        }

        return res.json(data)
    })

    app.post('/staking_drawWinners',async(req,res)=>{
        if (!req.query.project_name) {
            return res.status(422).send({message: 'Project name is required!'})
        }

        if (req.query.staking_provider != 'cardinal') {
            return res.status(422).send({message: 'Invalid staking provider!'})
        }
        
        if (!req.query.staking_pool) {
            return res.status(422).send({message: 'Please provide a valid staking pool.'})
        }
        
        if (!req.query.num_winners || req.query.num_winners < 1) {
            return res.status(422).send({message: 'Please provide how many winners.'})
        }
  
        const captcha = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: req.body.captcha}).toString()
        )

        if (!captcha.data.success) {
          return res.status(422).send({message: 'Captcha invalid!'})
        }

        const draw = await cardinal_staking(
            req.query.staking_pool,
            req.query.num_winners,
            req.query.project_name,
            req.body
        )
        const winnersData = []
        const tokenData = []

        for (let wallet of draw.walllets) {
          winnersData.push({
            id: draw.walllets.indexOf(wallet),
            wallet: wallet,
            action: 'copy'
          })
        }

        for (let token of draw.tokens) {
            tokenData.push({
              id: draw.tokens.indexOf(token),
              token: token,
              action: 'open'
            })
        }

        const data = {
          draw_id: draw.draw_id,
          project_name: draw.project_name,
          status: draw.status,
          raffle_type: draw.raffle_type,
          date: moment.unix(draw.time).format('MM/DD/YYYY HH:mm:ss'),
          tokens: tokenData,
          winners: winnersData,
        }

        return res.json(data)
    })


    app.get('/getwalletinfo', async(req,res)=>{
        let mint_address = req.query.mint_address
        let data = await getNFTInfo(mint_address)

        res.json(data)
    
    })
    
    app.get('/checkraffleid',async(req,res) =>{
        const id = req.query.raffle_id 
        let draw = await sql_checkid(id)
        const winnersData = []
        const tokenData = []

        for (let wallet of draw.selected_wallets.split(',')) {
          winnersData.push({
            id: draw.selected_wallets.indexOf(wallet),
            wallet: wallet,
            action: 'copy'
          })
        }

        for (let token of draw.selected_tokens.split(',')) {
            tokenData.push({
              id: draw.selected_tokens.indexOf(token),
              token: token,
              action: 'open'
            })
        }

        const data = {
          draw_id: draw.raffle_id,
          project_name: draw.raffled_project,
          status: 'Completed',
          raffle_type: draw.raffle_type,
          date: moment.unix(draw.raffle_time).format('MM/DD/YYYY HH:mm:ss'),
          tokens: tokenData,
          winners: winnersData,
        }

        res.json(data)
    })

    app.get('/raffles/:raffleId', async(req,res)=>{
        const id = req.params.raffleId
        let draw = await sql_checkid(id)
        const winnersData = []
        const tokenData = []

        for (let wallet of draw.selected_wallets.split(',')) {
          winnersData.push({
            id: draw.selected_wallets.indexOf(wallet),
            wallet: wallet,
            action: 'copy'
          })
        }

        for (let token of draw.selected_tokens.split(',')) {
            tokenData.push({
              id: draw.selected_tokens.indexOf(token),
              token: token,
              action: 'open'
            })
        }

        const data = {
          draw_id: draw.raffle_id,
          project_name: draw.raffled_project,
          status: 'Completed',
          raffle_type: draw.raffle_type,
          date: moment.unix(draw.raffle_time).format('MM/DD/YYYY HH:mm:ss'),
          tokens: tokenData,
          winners: winnersData,
        }

        res.json(data)
    })

    app.get('/test', async(req,res)=>{
        const data = req.body
        res.json(data.hashlist)
    })

    app.get('/nfts_in_wallet',async(req,res)=>{
        const wallet = req.query.wallet
        const json_list = req.body

        const data  = await getNFTsInWallet(wallet,json_list)
        

        res.json(data)
    })

        
    
}
