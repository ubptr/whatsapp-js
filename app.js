const express = require('express')
const app = express()
const port = 3000
const { createServer } = require('node:http');
const http = require('http');
const fs = require("fs");
const colors = require('colors');
const server = createServer(app);
const moment = require('moment-timezone');
const axios = require("axios")

const { Client, Location, Poll, List, Buttons, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const io = require('socket.io')(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true
    },
    allowEIO3: true
});

const client = new Client({
    restartOnAuthFail: true,
    authStrategy: new LocalAuth(),
    // proxyAuthentication: { username: 'username', password: 'password' },
    puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // <- this one doesn't works in Windows
          '--disable-gpu'
        ],
      },
});
const config = require('./config/config.json');
client.initialize();


server.listen(port, () => {
    console.log('App running on *: ' + port);
});
io.on('connection', (socket) => {
    socket.emit('message', 'Connecting...');
    client.on('qr', async (qr) => {
    // use qrcode_terminal for rendering in terminal
    //   qrcode_terminal.generate(qr, {small: true});

      qrcode.toDataURL(qr, (err, url) => {
        socket.emit('qr', url);
        socket.emit('message', 'QR Code received, scan please!');
      });
      const pairingCodeEnabled = false;
          if (pairingCodeEnabled && !pairingCodeRequested) {
              const pairingCode = await client.requestPairingCode('085186881840'); // enter the target phone number
              console.log('Pairing code enabled, code: '+ pairingCode);
              pairingCodeRequested = true;
          }
    });
  
    client.on('ready', async () => {
        console.clear();
        const consoleText = './config/console.txt';
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Attached current phone number session: ' + client.info.wid.user);
        
        fs.readFile(consoleText, 'utf-8', (err, data) => {
            if (err) {
                console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] Console Text not found!`.yellow);
                console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
            } else {
                console.log(data.blue);
                console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
            }
        });

        const debugWWebVersion = await client.getWWebVersion();
        socket.emit('message', `WWebVersion  = ${debugWWebVersion}`);
        client.pupPage.on('pageerror', function (err) {
            socket.emit('message', 'Page error:: ' + err.toString());
        });
        client.pupPage.on('error', function (err) {
            socket.emit('message', 'Page error:: ' + err.toString());
        });
    });
  
    client.on('authenticated', () => {
      socket.emit('authenticated', 'Whatsapp is authenticated!');
      socket.emit('message', 'Whatsapp successfuly authenticated!');
    });
  
    client.on('auth_failure', function(session) {
      socket.emit('message', 'Auth failure, restarting...');
    });
  
    client.on('disconnected', (reason) => {
      socket.emit('message', 'Whatsapp is disconnected!');
      client.destroy();
      client.initialize();
    });
    client.on('message', async msg => {
        let chatId = msg.from;
        const isGroups = msg.from.endsWith('@g.us') ? true : false;
        
        // socket.emit('message', 'MESSAGE RECEIVED' + msg);
    
        if (msg.body === '!ping reply') {
            // Send a new message as a reply to the current one
            msg.reply('pong');
    
        } else if (msg.body === '!ping') {
            // Send a new message to the same chat
            client.sendMessage(msg.from, 'pong');
    
        } else if (msg.body.startsWith('!sendto ')) {
            // Direct send a new message to specific id
            let number = msg.body.split(' ')[1];
            let messageIndex = msg.body.indexOf(number) + number.length;
            let message = msg.body.slice(messageIndex, msg.body.length);
            number = number.includes('@c.us') ? number : `${number}@c.us`;
            let chat = await msg.getChat();
            chat.sendSeen();
            client.sendMessage(number, message);
    
        } else if (msg.body.startsWith('!subject ')) {
            // Change the group subject
            let chat = await msg.getChat();
            if (chat.isGroup) {
                const isAdmin = chat.participants.find(participant => participant.id._serialized === msg.author && participant.isAdmin);
                if (isAdmin) {
                    let newSubject = msg.body.slice(9);
                    try {
                        await chat.setSubject(newSubject);
                        msg.reply('Subject Group updated successfully.');
                    } catch (error) {
                        console.error('Error updating Subject:', error);
                        msg.reply('Failed to update the group description.');
                    }
                } else {
                    msg.reply('You need to be an admin to change the group description.');
                }
            } else {
                msg.reply('This command can only be used in a group!');
            }
        } else if (msg.body.startsWith('!echo ')) {
            // Replies with the same message
            msg.reply(msg.body.slice(6));
        } else if (msg.body.startsWith('!preview ')) {
            const text = msg.body.slice(9);
            msg.reply(text, null, { linkPreview: true });
        } else if (msg.body.startsWith('!desc ')) {
            // Get chat and check if it is a group
            let chat = await msg.getChat();
            
            if (chat.isGroup) {
                // Check if the sender is an admin
                const isAdmin = chat.participants.find(participant => participant.id._serialized === msg.author && participant.isAdmin);
    
                if (isAdmin) {
                    let newDescription = msg.body.slice(6);
                    try {
                        await chat.setDescription(newDescription);
                        msg.reply('Group description updated successfully.');
                    } catch (error) {
                        console.error('Error updating description:', error);
                        msg.reply('Failed to update the group description.');
                    }
                } else {
                    msg.reply('You need to be an admin to change the group description.');
                }
            } else {
                msg.reply('This command can only be used in a group!');
            }
        } else if (msg.body.startsWith('!addmembers ')) {
            const group = await msg.getChat();
            let number = msg.body.slice(12);
            // const result = await group.addParticipants([number]);
            const result = await group.addParticipants([number], { comment: 'Welcome to the group' });
            /**
             * The example of the {@link result} output:
             *
             * {
             *   'number1@c.us': {
             *     code: 200,
             *     message: 'The participant was added successfully',
             *     isInviteV4Sent: false
             *   },
             *   'number2@c.us': {
             *     code: 403,
             *     message: 'The participant can be added by sending private invitation only',
             *     isInviteV4Sent: true
             *   },
             *   'number3@c.us': {
             *     code: 404,
             *     message: 'The phone number is not registered on WhatsApp',
             *     isInviteV4Sent: false
             *   }
             * }
             *
             * For more usage examples:
             * @see https://github.com/pedroslopez/whatsapp-web.js/pull/2344#usage-example1
             */
            console.log(result);
        } else if (msg.body === '!leave') {
            // Leave the group
            let chat = await msg.getChat();
            if (chat.isGroup) {
                chat.leave();
            } else {
                msg.reply('This command can only be used in a group!');
            }
        } else if (msg.body.startsWith('!join ')) {
            const inviteCode = msg.body.split(' ')[1];
            try {
                await client.acceptInvite(inviteCode);
                msg.reply('Joined the group!');
            } catch (e) {
                msg.reply('That invite code seems to be invalid.');
            }
        } else if (msg.body === '!groupinfo') {
            let chat = await msg.getChat();
            if (chat.isGroup) {
                try {
                    // Fetch the group photo URL using the client instance
                    const groupPhotoUrl = await client.getProfilePicUrl(chat.id._serialized);
    
                    if (groupPhotoUrl) {
                        console.log(`Group photo URL: ${groupPhotoUrl}`); // Log the photo URL for debugging
    
                        // Download the group photo
                        const response = await axios.get(groupPhotoUrl, { responseType: 'arraybuffer' });
    
                        if (response.status === 200) {
                            const mimeType = response.headers['content-type']; // Determine the MIME type from the response
                            const media = new MessageMedia(mimeType, Buffer.from(response.data, 'binary').toString('base64'), 'group-photo');
    
                            // Send the media message with a caption
                            await client.sendMessage(msg.from, media, {
                                caption: `
*Group Details*
Name: ${chat.name}
ID Group: ${chat.id._serialized}
Description: ${chat.description || 'No description available'}
Created At: ${chat.createdAt.toString()}
Participant Count: ${chat.participants.length}
                                `
                            });
                        } else {
                            console.error('Failed to download the group photo.');
                            msg.reply('Failed to retrieve the group photo.');
                        }
                    } else {
                        msg.reply(`
    *Group Details*
    Name: ${chat.name}
    ID Group: ${chat.id._serialized}
    Description: ${chat.description || 'No description available'}
    Created At: ${chat.createdAt.toString()}
    Participant Count: ${chat.participants.length}
    Group Photo: No photo available
                        `);
                    }
                } catch (error) {
                    console.error('Error fetching group photo:', error);
                    msg.reply(`
    *Group Details*
    Name: ${chat.name}
    ID Group: ${chat.id._serialized}
    Description: ${chat.description || 'No description available'}
    Created At: ${chat.createdAt.toString()}
    Participant Count: ${chat.participants.length}
    Group Photo: Could not retrieve the photo
                    `);
                }
            } else {
                msg.reply('This command can only be used in a group!');
            }
        } else if (msg.body === '!chats') {
            const chats = await client.getChats();
            client.sendMessage(msg.from, `The bot has ${chats.length} chats open.`);
        } else if (msg.body === '!info') {
            let info = client.info;
    
            try {
                // Fetch the user's profile picture URL
                const userProfilePicUrl = await client.getProfilePicUrl(info.wid._serialized);
    
                if (userProfilePicUrl) {
                    // Download the user's profile picture
                    const response = await axios.get(userProfilePicUrl, { responseType: 'arraybuffer' });
    
                    if (response.status === 200) {
                        const mimeType = response.headers['content-type']; // Determine the MIME type from the response
                        const media = new MessageMedia(mimeType, Buffer.from(response.data, 'binary').toString('base64'), 'profile-pic');
    
                        // Send the media message with a caption
                        await client.sendMessage(msg.from, media, {
                            caption: `
*Connection Info*
User Name: ${info.pushname}
My Number: ${info.wid.user}
Platform: ${info.platform}
                            `
                        });
                    } else {
                        console.error('Failed to download the profile picture.');
                        msg.reply('Failed to retrieve the profile picture.');
                    }
                } else {
                    // If there's no profile picture, send text info only
                    msg.reply(`
*Connection Info*
User Name: ${info.pushname}
My Number: ${info.wid.user}
Platform: ${info.platform}
Profile Picture: No photo available
                    `);
                }
            } catch (error) {
                console.error('Error fetching profile picture:', error);
                msg.reply(`
*Connection Info*
User Name: ${info.pushname}
My Number: ${info.wid.user}
Platform: ${info.platform}
Profile Picture: Could not retrieve the photo
                `);
            }
        } else if (msg.body === '!mediainfo' && msg.hasMedia) {
            const attachmentData = await msg.downloadMedia();
            msg.reply(`
                *Media info*
                MimeType: ${attachmentData.mimetype}
                Filename: ${attachmentData.filename}
                Data (length): ${attachmentData.data.length}
            `);
        } else if (msg.body === '!quoteinfo' && msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
    
            quotedMsg.reply(`
                ID: ${quotedMsg.id._serialized}
                Type: ${quotedMsg.type}
                Author: ${quotedMsg.author || quotedMsg.from}
                Timestamp: ${quotedMsg.timestamp}
                Has Media? ${quotedMsg.hasMedia}
            `);
        } else if (msg.body === '!resendmedia' && msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia) {
                const attachmentData = await quotedMsg.downloadMedia();
                client.sendMessage(msg.from, attachmentData, { caption: 'Here\'s your requested media.' });
            }
            if (quotedMsg.hasMedia && quotedMsg.type === 'audio') {
                const audio = await quotedMsg.downloadMedia();
                await client.sendMessage(msg.from, audio, { sendAudioAsVoice: true });
            }
        } else if (msg.body === '!isviewonce' && msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia) {
                const media = await quotedMsg.downloadMedia();
                await client.sendMessage(msg.from, media, { isViewOnce: true });
            }
        } else if (msg.body === '!location') {
            // only latitude and longitude
            await msg.reply(new Location(37.422, -122.084));
            // location with name only
            await msg.reply(new Location(37.422, -122.084, { name: 'Googleplex' }));
            // location with address only
            await msg.reply(new Location(37.422, -122.084, { address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA' }));
            // location with name, address and url
            await msg.reply(new Location(37.422, -122.084, { name: 'Googleplex', address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA', url: 'https://google.com' }));
        } else if (msg.location) {
            msg.reply(msg.location);
        } else if (msg.body.startsWith('!status ')) {
            const newStatus = msg.body.split(' ')[1];
            await client.setStatus(newStatus);
            msg.reply(`Status was updated to *${newStatus}*`);
        } else if (msg.body === '!mentionUsers') {
            const chat = await msg.getChat();
            const userNumber = 'XXXXXXXXXX';
            /**
             * To mention one user you can pass user's ID to 'mentions' property as is,
             * without wrapping it in Array, and a user's phone number to the message body:
             */
            await chat.sendMessage(`Hi @${userNumber}`, {
                mentions: userNumber + '@c.us'
            });
            // To mention a list of users:
            await chat.sendMessage(`Hi @${userNumber}, @${userNumber}`, {
                mentions: [userNumber + '@c.us', userNumber + '@c.us']
            });
        } else if (msg.body === '!mentionGroups') {
            const chat = await msg.getChat();
            const groupId = 'YYYYYYYYYY@g.us';
            /**
             * Sends clickable group mentions, the same as user mentions.
             * When the mentions are clicked, it opens a chat with the mentioned group.
             * The 'groupMentions.subject' can be custom
             * 
             * @note The user that does not participate in the mentioned group,
             * will not be able to click on that mentioned group, the same if the group does not exist
             *
             * To mention one group:
             */
            await chat.sendMessage(`Check the last message here: @${groupId}`, {
                groupMentions: { subject: 'GroupSubject', id: groupId }
            });
            // To mention a list of groups:
            await chat.sendMessage(`Check the last message in these groups: @${groupId}, @${groupId}`, {
                groupMentions: [
                    { subject: 'FirstGroup', id: groupId },
                    { subject: 'SecondGroup', id: groupId }
                ]
            });
        } else if (msg.body === '!getGroupMentions') {
            // To get group mentions from a message:
            const groupId = 'ZZZZZZZZZZ@g.us';
            const msg = await client.sendMessage(chatId, `Check the last message here: @${groupId}`, {
                groupMentions: { subject: 'GroupSubject', id: groupId }
            });
            /** {@link groupMentions} is an array of `GroupChat` */
            const groupMentions = await msg.getGroupMentions();
            console.log(groupMentions);
        } else if (msg.body === '!delete') {
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg.fromMe) {
                    quotedMsg.delete(true);
                } else {
                    msg.reply('I can only delete my own messages');
                }
            }
        } else if (msg.body === '!pin') {
            const chat = await msg.getChat();
            await chat.pin();
        } else if (msg.body === '!archive') {
            const chat = await msg.getChat();
            await chat.archive();
        } else if (msg.body === '!mute') {
            const chat = await msg.getChat();
            // mute the chat for 20 seconds
            const unmuteDate = new Date();
            unmuteDate.setSeconds(unmuteDate.getSeconds() + 20);
            await chat.mute(unmuteDate);
        } else if (msg.body === '!typing') {
            const chat = await msg.getChat();
            // simulates typing in the chat
            chat.sendStateTyping();
        } else if (msg.body === '!recording') {
            const chat = await msg.getChat();
            // simulates recording audio in the chat
            chat.sendStateRecording();
        } else if (msg.body === '!clearstate') {
            const chat = await msg.getChat();
            // stops typing or recording in the chat
            chat.clearState();
        } else if (msg.body === '!jumpto') {
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                client.interface.openChatWindowAt(quotedMsg.id._serialized);
            }
        } else if (msg.body === '!buttons') {
            let button = new Buttons('Button body', [{ body: 'bt1' }, { body: 'bt2' }, { body: 'bt3' }], 'title', 'footer');
            client.sendMessage(msg.from, button);
        } else if (msg.body === '!list') {
            let sections = [
                { title: 'sectionTitle', rows: [{ title: 'ListItem1', description: 'desc' }, { title: 'ListItem2' }] }
            ];
            let list = new List('List body', 'btnText', sections, 'Title', 'footer');
            client.sendMessage(msg.from, list);
        } else if (msg.body === '!reaction') {
            msg.react('👍');
        } else if (msg.body === '!sendpoll') {
            /** By default the poll is created as a single choice poll: */
            await msg.reply(new Poll('Winter or Summer?', ['Winter', 'Summer']));
            /** If you want to provide a multiple choice poll, add allowMultipleAnswers as true: */
            await msg.reply(new Poll('Cats or Dogs?', ['Cats', 'Dogs'], { allowMultipleAnswers: true }));
            /**
             * You can provide a custom message secret, it can be used as a poll ID:
             * @note It has to be a unique vector with a length of 32
             */
            await msg.reply(
                new Poll('Cats or Dogs?', ['Cats', 'Dogs'], {
                    messageSecret: [
                        1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                    ]
                })
            );
        } else if (msg.body === '!edit') {
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg.fromMe) {
                    quotedMsg.edit(msg.body.replace('!edit', ''));
                } else {
                    msg.reply('I can only edit my own messages');
                }
            }
        } else if (msg.body === '!updatelabels') {
            const chat = await msg.getChat();
            await chat.changeLabels([0, 1]);
        } else if (msg.body === '!addlabels') {
            const chat = await msg.getChat();
            let labels = (await chat.getLabels()).map((l) => l.id);
            labels.push('0');
            labels.push('1');
            await chat.changeLabels(labels);
        } else if (msg.body === '!removelabels') {
            const chat = await msg.getChat();
            await chat.changeLabels([]);
        } else if (msg.body === '!approverequest') {
            /**
             * Presented an example for membership request approvals, the same examples are for the request rejections.
             * To approve the membership request from a specific user:
             */
            await client.approveGroupMembershipRequests(msg.from, { requesterIds: 'number@c.us' });
            /** The same for execution on group object (no need to provide the group ID): */
            const group = await msg.getChat();
            await group.approveGroupMembershipRequests({ requesterIds: 'number@c.us' });
            /** To approve several membership requests: */
            const approval = await client.approveGroupMembershipRequests(msg.from, {
                requesterIds: ['number1@c.us', 'number2@c.us']
            });
            /**
             * The example of the {@link approval} output:
             * [
             *   {
             *     requesterId: 'number1@c.us',
             *     message: 'Rejected successfully'
             *   },
             *   {
             *     requesterId: 'number2@c.us',
             *     error: 404,
             *     message: 'ParticipantRequestNotFoundError'
             *   }
             * ]
             *
             */
            console.log(approval);
            /** To approve all the existing membership requests (simply don't provide any user IDs): */
            await client.approveGroupMembershipRequests(msg.from);
            /** To change the sleep value to 300 ms: */
            await client.approveGroupMembershipRequests(msg.from, {
                requesterIds: ['number1@c.us', 'number2@c.us'],
                sleep: 300
            });
            /** To change the sleep value to random value between 100 and 300 ms: */
            await client.approveGroupMembershipRequests(msg.from, {
                requesterIds: ['number1@c.us', 'number2@c.us'],
                sleep: [100, 300]
            });
            /** To explicitly disable the sleep: */
            await client.approveGroupMembershipRequests(msg.from, {
                requesterIds: ['number1@c.us', 'number2@c.us'],
                sleep: null
            });
        } else if (msg.body === '!pinmsg') {
            /**
             * Pins a message in a chat, a method takes a number in seconds for the message to be pinned.
             * WhatsApp default values for duration to pass to the method are:
             * 1. 86400 for 24 hours
             * 2. 604800 for 7 days
             * 3. 2592000 for 30 days
             * You can pass your own value:
             */
            const result = await msg.pin(60); // Will pin a message for 1 minute
            console.log(result); // True if the operation completed successfully, false otherwise
        } if ((isGroups && config.groups) || !isGroups) {

            // Image to Sticker (Auto && Caption)
            if ((msg.type == "image" || msg.type == "video" || msg.type  == "gif") || (msg._data.caption == `${config.prefix}sticker`)) {
                if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} created sticker`);
                client.sendMessage(msg.from, "*[⏳]* Loading..");
                try {
                    const media = await msg.downloadMedia();
                    client.sendMessage(msg.from, media, {
                        sendMediaAsSticker: true,
                        stickerName: config.name, // Sticker Name = Edit in 'config/config.json'
                        stickerAuthor: config.author // Sticker Author = Edit in 'config/config.json'
                    }).then(() => {
                        client.sendMessage(msg.from, "*[✅]* Successfully!");
                    });
                } catch {
                    client.sendMessage(msg.from, "*[❎]* Failed!");
                }
    
            // Image to Sticker (With Reply Image)
            } else if (msg.body == `${config.prefix}sticker`) {
                if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} created sticker`);
                const quotedMsg = await msg.getQuotedMessage(); 
                if (msg.hasQuotedMsg && quotedMsg.hasMedia) {
                    client.sendMessage(msg.from, "*[⏳]* Loading..");
                    try {
                        const media = await quotedMsg.downloadMedia();
                        client.sendMessage(msg.from, media, {
                            sendMediaAsSticker: true,
                            stickerName: config.name, // Sticker Name = Edit in 'config/config.json'
                            stickerAuthor: config.author // Sticker Author = Edit in 'config/config.json'
                        }).then(() => {
                            client.sendMessage(msg.from, "*[✅]* Successfully!");
                        });
                    } catch {
                        client.sendMessage(msg.from, "*[❎]* Failed!");
                    }
                } else {
                    client.sendMessage(msg.from, "*[❎]* Reply Image First!");
                }
    
            // Sticker to Image (Auto)
            } else if (msg.type == "sticker") {
                if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} convert sticker into image`);
                client.sendMessage(msg.from, "*[⏳]* Loading..");
                try {
                    const media = await msg.downloadMedia();
                    client.sendMessage(msg.from, media).then(() => {
                        client.sendMessage(msg.from, "*[✅]* Successfully!");
                    });  
                } catch {
                    client.sendMessage(msg.from, "*[❎]* Failed!");
                }
    
            // Sticker to Image (With Reply Sticker)
            } else if (msg.body == `${config.prefix}image`) {
                if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} convert sticker into image`);
                const quotedMsg = await msg.getQuotedMessage(); 
                if (msg.hasQuotedMsg && quotedMsg.hasMedia) {
                    client.sendMessage(msg.from, "*[⏳]* Loading..");
                    try {
                        const media = await quotedMsg.downloadMedia();
                        client.sendMessage(msg.from, media).then(() => {
                            client.sendMessage(msg.from, "*[✅]* Successfully!");
                        });
                    } catch {
                        client.sendMessage(msg.from, "*[❎]* Failed!");
                    }
                } else {
                    client.sendMessage(msg.from, "*[❎]* Reply Sticker First!");
                }
    
            // Claim or change sticker name and sticker author
            } else if (msg.body.startsWith(`${config.prefix}change`)) {
                if (config.log) console.log(`[${'!'.red}] ${msg.from.replace("@c.us", "").yellow} change the author name on the sticker`);
                if (msg.body.includes('|')) {
                    let name = msg.body.split('|')[0].replace(msg.body.split(' ')[0], '').trim();
                    let author = msg.body.split('|')[1].trim();
                    const quotedMsg = await msg.getQuotedMessage(); 
                    if (msg.hasQuotedMsg && quotedMsg.hasMedia) {
                        client.sendMessage(msg.from, "*[⏳]* Loading..");
                        try {
                            const media = await quotedMsg.downloadMedia();
                            client.sendMessage(msg.from, media, {
                                sendMediaAsSticker: true,
                                stickerName: name,
                                stickerAuthor: author
                            }).then(() => {
                                client.sendMessage(msg.from, "*[✅]* Successfully!");
                            });
                        } catch {
                            client.sendMessage(msg.from, "*[❎]* Failed!");
                        }
                    } else {
                        client.sendMessage(msg.from, "*[❎]* Reply Sticker First!");
                    }
                } else {
                    client.sendMessage(msg.from, `*[❎]* Run the command :\n*${config.prefix}change <name> | <author>*`);
                }
            
            // Read chat
            } else {
                client.getChatById(msg.id.remote).then(async (chat) => {
                    await chat.sendSeen();
                });
            }
        }
    });

    client.on('message_create', async (msg) => {
        // Fired on all message creations, including your own
        if (msg.fromMe) {
            // do stuff here
        }
    
        // Unpins a message
        if (msg.fromMe && msg.body.startsWith('!unpin')) {
            const pinnedMsg = await msg.getQuotedMessage();
            if (pinnedMsg) {
                // Will unpin a message
                const result = await pinnedMsg.unpin();
                console.log(result); // True if the operation completed successfully, false otherwise
            }
        }
    });
    
    client.on('message_ciphertext', (msg) => {
        // Receiving new incoming messages that have been encrypted
        // msg.type === 'ciphertext'
        msg.body = 'Waiting for this message. Check your phone.';
        
        // do stuff here
    });
    
    client.on('message_revoke_everyone', async (after, before) => {
        // Fired whenever a message is deleted by anyone (including you)
        console.log(after); // message after it was deleted.
        if (before) {
            console.log(before); // message before it was deleted.
        }
    });
    
    client.on('message_revoke_me', async (msg) => {
        // Fired whenever a message is only deleted in your own view.
        console.log(msg.body); // message before it was deleted.
    });
    
    client.on('message_ack', (msg, ack) => {
        /*
            == ACK VALUES ==
            ACK_ERROR: -1
            ACK_PENDING: 0
            ACK_SERVER: 1
            ACK_DEVICE: 2
            ACK_READ: 3
            ACK_PLAYED: 4
        */
    
        if (ack == 3) {
            // The message was read
        }
    });
    
    client.on('group_join', async (notification) => {
        // User has joined or been added to the group.
        console.log('join', notification);
        notification.reply('User joined.');
    });
    
    client.on('group_leave', (notification) => {
        // User has left or been kicked from the group.
        console.log('leave', notification);
        notification.reply('User left.');
    });
    
    client.on('group_update', (notification) => {
        // Group picture, subject or description has been updated.
        console.log('update', notification);
    });
    
    client.on('change_state', state => {
        console.log('CHANGE STATE', state);
    });
    
    // Change to false if you don't want to reject incoming calls
    let rejectCalls = true;
    
    client.on('call', async (call) => {
        console.log('Call received, rejecting. GOTO Line 261 to disable', call);
        if (rejectCalls) await call.reject();
        await client.sendMessage(call.from, `[${call.fromMe ? 'Outgoing' : 'Incoming'}] Phone call from ${call.from}, type ${call.isGroup ? 'group' : ''} ${call.isVideo ? 'video' : 'audio'} call. ${rejectCalls ? 'This call was automatically rejected by the script.' : ''}`);
    });
    
    
    client.on('contact_changed', async (message, oldId, newId, isContact) => {
        /** The time the event occurred. */
        const eventTime = (new Date(message.timestamp * 1000)).toLocaleString();
    
        console.log(
            `The contact ${oldId.slice(0, -5)}` +
            `${!isContact ? ' that participates in group ' +
                `${(await client.getChatById(message.to ?? message.from)).name} ` : ' '}` +
            `changed their phone number\nat ${eventTime}.\n` +
            `Their new phone number is ${newId.slice(0, -5)}.\n`);
    
        /**
         * Information about the @param {message}:
         * 
         * 1. If a notification was emitted due to a group participant changing their phone number:
         * @param {message.author} is a participant's id before the change.
         * @param {message.recipients[0]} is a participant's id after the change (a new one).
         * 
         * 1.1 If the contact who changed their number WAS in the current user's contact list at the time of the change:
         * @param {message.to} is a group chat id the event was emitted in.
         * @param {message.from} is a current user's id that got an notification message in the group.
         * Also the @param {message.fromMe} is TRUE.
         * 
         * 1.2 Otherwise:
         * @param {message.from} is a group chat id the event was emitted in.
         * @param {message.to} is @type {undefined}.
         * Also @param {message.fromMe} is FALSE.
         * 
         * 2. If a notification was emitted due to a contact changing their phone number:
         * @param {message.templateParams} is an array of two user's ids:
         * the old (before the change) and a new one, stored in alphabetical order.
         * @param {message.from} is a current user's id that has a chat with a user,
         * whos phone number was changed.
         * @param {message.to} is a user's id (after the change), the current user has a chat with.
         */
    });
    
    client.on('group_admin_changed', (notification) => {
        if (notification.type === 'promote') {
            /** 
              * Emitted when a current user is promoted to an admin.
              * {@link notification.author} is a user who performs the action of promoting/demoting the current user.
              */
            console.log(`You were promoted by ${notification.author}`);
        } else if (notification.type === 'demote')
            /** Emitted when a current user is demoted to a regular user. */
            console.log(`You were demoted by ${notification.author}`);
    });
    
    client.on('group_membership_request', async (notification) => {
        /**
         * The example of the {@link notification} output:
         * {
         *     id: {
         *         fromMe: false,
         *         remote: 'groupId@g.us',
         *         id: '123123123132132132',
         *         participant: 'number@c.us',
         *         _serialized: 'false_groupId@g.us_123123123132132132_number@c.us'
         *     },
         *     body: '',
         *     type: 'created_membership_requests',
         *     timestamp: 1694456538,
         *     chatId: 'groupId@g.us',
         *     author: 'number@c.us',
         *     recipientIds: []
         * }
         *
         */
        console.log(notification);
        /** You can approve or reject the newly appeared membership request: */
        await client.approveGroupMembershipRequestss(notification.chatId, notification.author);
        await client.rejectGroupMembershipRequests(notification.chatId, notification.author);
    });
    
    client.on('message_reaction', async (reaction) => {
        console.log('REACTION RECEIVED', reaction);
    });
    
    client.on('vote_update', (vote) => {
        /** The vote that was affected: */
        console.log(vote);
    });

    app.get("/logout", async (req, res) => { 
        try {
            let logOutuser = await client.logout();
            if (logOutuser === true) {
                res.status(200).json({ status: true, msg: 'Berhasil Logout!' });
                console.log(`Berhasil Logout`);
            } else {
                res.status(500).json({ status: false, msg: 'Logout gagal!' });
            }
        } catch (error) {
            res.status(500).json({ status: false, msg: 'Terjadi kesalahan saat logout!' });
            console.error('Logout error:', error);
        }
    });
  });



  async function sendMediaFromUrl(number, mediaUrl, caption = '') {
    try {
        // Fetch media from the URL
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const mimetype = response.headers['content-type'];
        const data = response.data.toString('base64');

        // Create a new MessageMedia object
        const media = new MessageMedia(mimetype, data);

        // Send the media message to the specified number
        await client.sendMessage(number + '@c.us', media, { caption });
        console.log('Media message sent successfully.');
    } catch (err) {
        console.error('Failed to send media message:', err);
    }
}

async function addParticipants(groupId, numbers) {
    try {
        const chat = await client.getChatById(groupId);

        // Check if chat is a group
        if (!chat.isGroup) {
            throw new Error('The specified chat is not a group.');
        }

        // Add participants
        await chat.addParticipants(numbers);
        console.log('Participants added successfully.');
    } catch (error) {
        console.error('Error adding participants:', error);
        throw error;
    }
}

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
  });

 


//http://localhost:3000/send-media/instance123?number=1234567890&mediaUrl=https%3A%2F%2Fexample.com%2Fimage.png&mediaType=image%2Fpng&caption=An%20Image
app.get('/send-media', async (req, res) => {
    
    const { number, mediaUrl, caption = '' } = req.query; // Use query parameters

    try {
      sendMediaFromUrl(number, mediaUrl, caption);
        res.send({ success: true, message: "Media message sent successfully." });
    } catch (err) {
        console.error(`Failed to send media message for instance`, err);
        res.status(500).send({ success: false, message: "Failed to send media message.", error: err.toString() });
    }
});

app.get('/send-text', async (req, res) => {
    const { number, message } = req.query;

    // Validasi input
    if (!number || !message) {
        return res.status(400).send({ success: false, message: "Missing required parameters: number and message." });
    }

    try {
        // Mengirim pesan ke grup
        await client.sendMessage(number, message);
        res.send({ success: true, message: "Message sent successfully." });
    } catch (err) {
        console.error('Failed to send message:', err);
        res.status(500).send({ success: false, message: "Failed to send message.", error: err.toString() });
    }
});

app.get('/add-member', async (req, res) => {
    const { groupId, number, caption } = req.query;

    if (!groupId || !number) {
        return res.status(400).send({ success: false, message: "Missing required parameters: groupId and number." });
    }

    console.log('Adding participants:', groupId, number);

    if (caption && caption.trim() !== '') {
        try {
            // Send caption to the group
            await client.sendMessage(groupId, caption);
        } catch (err) {
            console.error('Failed to send message:', err);
            return res.status(500).send({ success: false, message: "Failed to send caption.", error: err.toString() });
        }
    }

    const numbers = [number]; // Convert to array format

    try {
        await addParticipants(groupId, numbers);
        res.send({ success: true, message: "Added Successfully" });
    } catch (err) {
        console.error('Failed to add participants:', err);
        res.status(500).send({ success: false, message: "Failed to add participants.", error: err.toString() });
    }
});

