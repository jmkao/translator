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
  if (msg.message) {
    console.log(msg.message);
  } else {
    console.log(msg);
  }
}
async function info(msg) {
  log.info(logging.entry(null, msg));
}
async function warn(msg) {
  log.warn(logging.entry(null, msg));
  console.log(msg);
}
async function error(msg) {
  log.error(logging.entry(null, msg));
  console.log(msg);
}

notice({service: 'INIT', method: 'logging', message: 'DeepL Translator Bot Launched'});

const prefix = nconf.get('prefix');
const deepl_auth_key = nconf.get('deepl_auth_key');
const deepl_url = "https://api.deepl.com/v2/translate?auth_key="+deepl_auth_key;

const cross_channel_ids = nconf.get('cross_channel_pairs');
var cross_channels = {};

const client = new Discord.Client();
var cldIdentifier;

cld3.loadModule().then(factory => {
  cldIdentifier = factory.create(0,700);
  notice({service: 'INIT', method: 'cld3-asm', message: 'loadModule() factory created'});
  client.login(nconf.get('discord_bot_token'));
});

client.once('ready', () => {
	notice({service: 'INIT', method: 'discord', message: 'client connection ready'});
 
  client.user.setActivity(nconf.get('auto_trans_channel'));

  for (let [key, value] of Object.entries(cross_channel_ids)) {
    client.channels.fetch(value).then( channel => {
      cross_channels[key] = channel;
    });
  }
});

client.on('message', message => {
  handleMessage(message).catch(err => {
    error({service: 'ONMESSAGE', method: 'on', msgId: message.id, message: err.message, details: err});
  });
});

async function handleMessage(message) {
  try {
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
  
      info({service: 'ONMESSAGE', method: 'command', msgId: message.id, message: cmd});
    } else if (cross_channels[message.channel.id] != null) {
      replyChannel = cross_channels[message.channel.id];
      text = message.content;
  
      let src_ident = cldIdentifier.findLanguage(text);
      let src_lang = src_ident.language;
      if (src_lang === 'ja' || src_lang === 'zh') {
        cmd = 'je'
      } else {
        cmd = 'ej'
      }
      info({service: 'ONMESSAGE', method: 'cld3-asm-detect', msgId: message.id, from_lang: src_lang, details: src_ident});
    } else {
      return;
    }
  
    info({service: 'ONMESSAGE', method: 'discord-message', msgId: message.id, author: message.author.username, channel: `${replyChannel.name}`, message: message.content, details: message.toJSON()});
   
    if (cmd === 'ej') {
      handleTranslationReply(text, 'JA', message, replyChannel);
    } else if (cmd === 'je') {
      handleTranslationReply(text, 'EN', message, replyChannel);
    }  
  } catch {
    warn({service: 'ONMESSAGE', method: 'handleMessage', msgId: message.id, message: err.message, details: err});
  }
}

async function handleTranslationReply(text, target_lang, message, replyChannel) {
  try {
    replyChannel.startTyping();
    const result = await translate(text, target_lang, message)
    replyChannel.send(result);
    replyChannel.stopTyping();
  } catch (err) {
    warn({service: 'TRANSLATE', method: 'handleTranslationReply', msgId: message.id, message: err.message, details: err});
  }
}

async function translate(text, lang, message) {
  let matches = text.matchAll(/(<[^\s]+>)/g);
  let escapes = [];
  for (const match of matches) {
    escapes.push(match[0]);
    text = text.replace(match[0], esc+escapes.length);
  }

  let result = await deeplTranslate(text, lang, message);

  if (result == null || result.length == 0) {
    result = "<Empty translation returned from service>";
  } else if (result.length > 2000) {
    result = "<Translation too large for Discord message>";
  }

  for (let i=1;i<=escapes.length;i++) {
    result = result.replace(esc+i, escapes[i-1]);
  }

  return `\`\`\`${message.author.username}: ${result}\`\`\``;
}

async function deeplTranslate(text, targetLang, message) {
  try {
    const request = {
      auth_key: deepl_auth_key,
      target_lang: targetLang,
      text: text,
    };
    info({service: 'TRANSLATE', method: 'deepl-request', msgId: message.id, to_lang: targetLang, message: text, length: text.length, details: request});
    const response = await axios.post(deepl_url, qs.stringify(request))
    client.user.setActivity("DeepL");
  
    info({service: 'TRANSLATE',
      method: 'deepl-response',
      msgId: message.id,
      from_lang: response.data.translations[0].detected_source_language,
      message: response.data.translations[0].text,
    });
    return response.data.translations[0].text;  
  } catch (err) {
    warn({service: 'TRANSLATE', method: 'deepl-response', msgId: message.id, message: err.message, details: err});
    return "<Error returned from deepl>";
  }
}