const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// --- MINI SERVEUR WEB (Health Check) ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Discord en ligne !');
});
server.listen(process.env.PORT || 3000, () => {
    console.log('Mini serveur web actif sur le port 3000');
});

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Base de données JSON
const dbFile = './bank_db.json';
let bankData = {};
if (fs.existsSync(dbFile)) {
    try {
        bankData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
        bankData = {};
    }
} else {
    fs.writeFileSync(dbFile, JSON.stringify({}));
}

function saveDb() {
    fs.writeFileSync(dbFile, JSON.stringify(bankData, null, 2));
}

function getUserData(userId) {
    if (!bankData[userId]) {
        bankData[userId] = { balance: 100, bank: 0, lastDaily: 0, inventory: [], rep: 0, blacklisted: false };
    }
    // Rétrocompatibilité des propriétés
    if (bankData[userId].balance === undefined) bankData[userId].balance = 100;
    if (bankData[userId].bank === undefined) bankData[userId].bank = 0;
    if (bankData[userId].lastDaily === undefined) bankData[userId].lastDaily = 0;
    if (!bankData[userId].inventory) bankData[userId].inventory = [];
    if (bankData[userId].rep === undefined) bankData[userId].rep = 0;
    if (bankData[userId].blacklisted === undefined) bankData[userId].blacklisted = false;
    return bankData[userId];
}

// --- GÉNÉRATEUR D'IMAGE CARTE BANCAIRE (Canvas) ---
async function generateBankCard(user, userData) {
    const canvas = createCanvas(700, 250);
    const ctx = canvas.getContext('2d');

    // Dégradé diagonal Bleu -> Violet -> Rouge
    const gradient = ctx.createLinearGradient(0, 0, 700, 250);
    gradient.addColorStop(0, '#1E3A8A'); // Bleu
    gradient.addColorStop(0.5, '#7C3AED'); // Violet
    gradient.addColorStop(1, '#DC2626'); // Rouge
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 700, 250);

    // Effet visuel / Design de carte
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(600, 50, 150, 0, Math.PI * 2);
    ctx.fill();

    // Avatar utilisateur en haut à gauche
    try {
        const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await loadImage(avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(65, 65, 40, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 25, 25, 80, 80);
        ctx.restore();

        // Bordure avatar
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(65, 65, 40, 0, Math.PI * 2);
        ctx.stroke();
    } catch (e) {
        console.error("Erreur chargement avatar canvas :", e);
    }

    // Nom d'utilisateur en haut à gauche (à côté de l'avatar)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(user.username, 120, 60);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('COMPTE OFFICIEL • SECURIZED', 120, 85);

    // Solde au milieu à droite, un peu haut
    ctx.textAlign = 'right';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('SOLDE TOTAL DISPONIBLE', 660, 80);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#FACC15'; // Jaune / Or
    ctx.fillText(`${userData.balance + userData.bank} 🪙`, 660, 125);

    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`ID: ${user.id}`, 30, 220);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'bank-card.png' });
}

// Liste des commandes slash
const commands = [
    new SlashCommandBuilder().setName('daily').setDescription('Récupère ta récompense quotidienne de pièces !'),
    new SlashCommandBuilder().setName('banque').setDescription('Vérifie ton solde bancaire avec une belle carte stylée.'),
    new SlashCommandBuilder().setName('profile').setDescription('Affiche ton profil complet et ton rang.'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Affiche le classement des plus riches du serveur.'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Parie tes pièces sur Pile ou Face.')
        .addIntegerOption(o => o.name('mise').setDescription('Montant à miser').setRequired(true))
        .addStringOption(o => o.name('choix').setDescription('pile ou face').setRequired(true).addChoices({ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' })),
    new SlashCommandBuilder().setName('deposit').setDescription('Dépose de l\'argent en banque.').addIntegerOption(o => o.name('montant').setDescription('Montant à déposer').setRequired(true)),
    new SlashCommandBuilder().setName('withdraw').setDescription('Retire de l\'argent de la banque.').addIntegerOption(o => o.name('montant').setDescription('Montant à retirer').setRequired(true)),
    new SlashCommandBuilder().setName('pay').setDescription('Envoie de l\'argent à un autre utilisateur.').addUserOption(o => o.name('destinataire').setDescription('À qui envoyer').setRequired(true)).addIntegerOption(o => o.name('montant').setDescription('Montant').setRequired(true)),
    new SlashCommandBuilder().setName('ping').setDescription('Vérifie la latence du bot.'),
    
    // --- COMMANDES ADMIN ---
    new SlashCommandBuilder().setName('give').setDescription('[Admin] Donne de l\'argent à un utilisateur.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.name('montant').setDescription('Montant à donner').setRequired(true)),
    new SlashCommandBuilder().setName('remove').setDescription('[Admin] Retire de l\'argent à un utilisateur.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.name('montant').setDescription('Montant à retirer').setRequired(true)),
    new SlashCommandBuilder().setName('block').setDescription('[Admin] Bloque l\'accès d\'un utilisateur aux commandes.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('unblock').setDescription('[Admin] Débloque un utilisateur.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('blacklist').setDescription('[Admin] Bannit définitivement un utilisateur du système.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true)),
    new SlashCommandBuilder().setName('whitelist').setDescription('[Admin] Retire un utilisateur de la blacklist.')
        .addUserOption(o => o.name('cible').setDescription('Membre').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag} !`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || 'TON_TOKEN_ICI');
    try {
        console.log('Enregistrement des commandes slash...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commandes slash enregistrées avec succès !');
    } catch (erreur) {
        console.error(erreur);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, member } = interaction;
    const userData = getUserData(user.id);

    // Vérification de la blacklist globale
    if (userData.blacklisted) {
        return interaction.reply({ content: '⛔ Vous êtes blacklisté et ne pouvez pas utiliser ce bot.', ephemeral: true });
    }

    // Gestion des commandes Admin / Sécurité rôle
    const adminCommands = ['give', 'remove', 'block', 'unblock', 'blacklist', 'whitelist'];
    if (adminCommands.includes(commandName)) {
        if (!member.permissions.has('Administrator')) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('⛔ Accès Refusé').setDescription('Réservé aux administrateurs.')],
                ephemeral: true
            });
        }
    }

    try {
        if (commandName === 'ping') {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🏓 Pong !')
                .setDescription(`Latence du bot : **${client.ws.ping}ms**`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        else if (commandName === 'daily') {
            const maintenant = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            if (maintenant - userData.lastDaily < cooldown) {
                const restant = cooldown - (maintenant - userData.lastDaily);
                const heures = Math.floor(restant / (1000 * 60 * 60));
                const embed = new EmbedBuilder()
                    .setColor(0xFF5733)
                    .setTitle('⏳ Patientez !')
                    .setDescription(`Revenez dans **${heures} heure(s)** pour votre récompense.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            userData.balance += 500;
            userData.lastDaily = maintenant;
            saveDb();
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('💰 Récompense quotidienne')
                .setDescription(`Félicitations ${user}, vous avez reçu **500 pièces** !`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        else if (commandName === 'banque') {
            await interaction.deferReply();
            const attachment = await generateBankCard(user, userData);
            const embed = new EmbedBuilder()
                .setColor(0x3B82F6)
                .setTitle('🏦 COMPTE BANCAIRE OFFICIEL')
                .setImage('attachment://bank-card.png')
                .setFooter({ text: 'Système sécurisé • Dégradé Bleu, Violet & Rouge' })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
        else if (commandName === 'deposit') {
            const montant = interaction.options.getInteger('montant');
            if (montant <= 0 || userData.balance < montant) {
                return interaction.reply({ content: '❌ Montant invalide ou solde insuffisant.', ephemeral: true });
            }
            userData.balance -= montant;
            userData.bank += montant;
            saveDb();
            await interaction.reply({ content: `✅ Vous avez déposé **${montant} pièces** en banque.`, ephemeral: true });
        }
        else if (commandName === 'withdraw') {
            const montant = interaction.options.getInteger('montant');
            if (montant <= 0 || userData.bank < montant) {
                return interaction.reply({ content: '❌ Montant invalide ou solde bancaire insuffisant.', ephemeral: true });
            }
            userData.bank -= montant;
            userData.balance += montant;
            saveDb();
            await interaction.reply({ content: `✅ Vous avez retiré **${montant} pièces** de la banque.`, ephemeral: true });
        }
        // --- COMMANDES ADMIN ---
        else if (commandName === 'give') {
            const cible = interaction.options.getUser('cible');
            const montant = interaction.options.getInteger('montant');
            const cibleData = getUserData(cible.id);
            cibleData.balance += montant;
            saveDb();
            await interaction.reply({ content: `🛡️ [ADMIN] ${montant} pièces ajoutées à ${cible.username}.` });
        }
        else if (commandName === 'remove') {
            const cible = interaction.options.getUser('cible');
            const montant = interaction.options.getInteger('montant');
            const cibleData = getUserData(cible.id);
            cibleData.balance = Math.max(0, cibleData.balance - montant);
            saveDb();
            await interaction.reply({ content: `🛡️ [ADMIN] ${montant} pièces retirées à ${cible.username}.` });
        }
        else if (commandName === 'block') {
            const cible = interaction.options.getUser('cible');
            const cibleData = getUserData(cible.id);
            cibleData.blacklisted = true;
            saveDb();
            await interaction.reply({ content: `⛔ [ADMIN] ${cible.username} a été bloqué.` });
        }
        else if (commandName === 'unblock' || commandName === 'whitelist') {
            const cible = interaction.options.getUser('cible');
            const cibleData = getUserData(cible.id);
            cibleData.blacklisted = false;
            saveDb();
            await interaction.reply({ content: `✅ [ADMIN] ${cible.username} a été débloqué / whiteliste.` });
        }
        else if (commandName === 'blacklist') {
            const cible = interaction.options.getUser('cible');
            const cibleData = getUserData(cible.id);
            cibleData.blacklisted = true;
            saveDb();
            await interaction.reply({ content: `🚨 [ADMIN] ${cible.username} a été totalement blacklisté.` });
        }
        else {
            await interaction.reply({ content: `Commande /${commandName} exécutée avec succès !`, ephemeral: true });
        }
    } catch (err) {
        console.error(err);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⚠️ Erreur')
            .setDescription('Une erreur est survenue lors de l\'exécution.')
            .setTimestamp();
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN || 'TON_TOKEN_ICI');
