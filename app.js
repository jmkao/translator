const nconf = require('nconf');
const Discord = require('discord.js');
const axios = require('axios');
const qs = require('qs');
const {Logging} = require('@google-cloud/logging');
const cld3 = require('cld3-asm');

const esc = '٪';
nconf.file({
  file: 'config.yaml',
  format: require('nconf-yaml')
});

const projectId = nconf.get('gcp_project');
const logging = new Logging({projectId});
const log = logging.log(nconf.get('gcp_log_name'));
async function notice(msg) {
  log.notice(logging.entry(null, msg));
  console.log(msg);
}
async function info(msg) {
  log.info(logging.entry(null, msg));
}
async function error(msg) {
  log.error(logging.entry(null, msg));
  console.log(msg);
}

const prefix = nconf.get('prefix');
const deepl_auth_key = nconf.get('deepl_auth_key');
const deepl_url = "https://api.deepl.com/v2/translate?auth_key="+deepl_auth_key;

const cross_channel_ids = nconf.get('cross_channel_pairs');
var cross_channels = {};

const client = new Discord.Client();
var cldIdentifier;
cld3.loadModule().then(factory => {
  cldIdentifier = factory.create(0,700);
  client.login(nconf.get('discord_bot_token'));
});

client.once('ready', () => {
	notice('DeepL Translator Bot Ready');
 
  client.user.setActivity(nconf.get('auto_trans_channel'));

  for (let [key, value] of Object.entries(cross_channel_ids)) {
    client.channels.fetch(value).then( channel => {
      cross_channels[key] = channel;
    });
  }
});

client.on('message', message => {
  if (message.author.bot) {
    return;
  }

  let cmd;
  let text;
  let replyChannel;

  if (message.content.startsWith(prefix)) {
    const cmdEndIndex = message.content.indexOf(' ');

    cmd = message.content.substring(1, cmdEndIndex).toLowerCase();
    text = message.content.substring(cmdEndIndex + 1);
    replyChannel = message.channel;
  } else if (cross_channels[message.channel.id] != null) {
    replyChannel = cross_channels[message.channel.id];
    text = message.content;
    if (cldIdentifier.findLanguage(text).language === 'ja') {
      cmd = 'je'
    } else {
      cmd = 'ej'
    }
  }
 
  if (cmd === 'ej') {
    info(message.toJSON());
    translate(text, 'JA', message.author).then( result => {
      replyChannel.send(result);
    });
  } else if (cmd === 'je') {
    info(message.toJSON());
    translate(text, 'EN', message.author).then( result => {
      replyChannel.send(result);
    });
  }
})

async function translate(text, lang, author) {
  let matches = text.matchAll(/(<[^\s]+>)/g);
  let escapes = [];
  for (const match of matches) {
    escapes.push(match[0]);
    text = text.replace(match[0], esc+escapes.length);
  }

  let result = await deeplTranslate(text, lang);

  if (result == null || result.length == 0) {
    return result;
  }

  for (let i=1;i<=escapes.length;i++) {
    result = result.replace(esc+i, escapes[i-1]);
  }

  return `**@${author.username}** ${result}`;
}

async function deeplTranslate(text, targetLang) {
  try {
    const request = {
      auth_key: deepl_auth_key,
      target_lang: targetLang,
      text: text,
    };
    info(request);
    const response = await axios.post(deepl_url, qs.stringify(request))
    //console.log(response);
    client.user.setActivity("DeepL");
  
    info(response.data.translations[0]);
    return response.data.translations[0].text;  
  } catch (err) {
    error(err.toJSON());
    return "Error...";
  }
}