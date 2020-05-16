const nconf = require('nconf');
const Discord = require('discord.js');
const axios = require('axios');
const qs = require('qs');

nconf.file({
  file: 'config.yaml',
  format: require('nconf-yaml')
});

const prefix = nconf.get('prefix');
const deepl_auth_key = nconf.get('deepl_auth_key');
const deepl_url = "https://api.deepl.com/v2/translate?auth_key="+deepl_auth_key;

const client = new Discord.Client();
client.login(nconf.get('discord_bot_token'));

client.once('ready', () => {
	console.log('Ready!');

  client.user.setActivity(nconf.get('auto_trans_channel'));
});

client.on('message', message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const cmdEndIndex = message.content.indexOf(' ');

  const cmd = message.content.substring(1, cmdEndIndex).toLowerCase();
  const text = message.content.substring(cmdEndIndex + 1);

  console.log("Captured command: "+cmd)

  if (cmd === 'ej') {
    deeplTranslate(text, 'JA').then( result => {
      message.channel.send(result);
    });
  } else if (cmd === 'je') {
    deeplTranslate(text, 'EN').then( result => {
      message.channel.send(result);
    });
  }
})

async function deeplTranslate(text, targetLang) {
  console.log("DeepL Translate: "+text);
  try {
    const response = await axios.post(deepl_url, qs.stringify({
      auth_key: deepl_auth_key,
      target_lang: targetLang,
      text: text
    }))
    //console.log(response);
    client.user.setActivity("DeepL");
  
    return response.data.translations[0].text;  
  } catch (err) {
    console.log(err);
    return "";
  }
}