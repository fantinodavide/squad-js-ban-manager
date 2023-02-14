import { DataTypes, Op } from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';
import Sequelize from 'sequelize';

export default class BanManager extends DiscordBasePlugin {
    static get description() {
        return "Ban Manager plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix: {
                required: false,
                description: "Prefix of every switch command",
                default: "!ban"
            },
            database: {
                required: true,
                connector: 'sequelize',
                description: 'The Sequelize connector.',
                default: 'mysql'
            },
            banMessageFormat: {
                required: false,
                description: "",
                default: "Ban ID: {ban_id} | Reason: {reason} | Duration: {duration}"
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.models = {};

        this.createModel(
            'Bans',
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                username: {
                    type: DataTypes.STRING
                },
                steamID: {
                    type: DataTypes.STRING,
                    notNull: true
                },
                reason: {
                    type: DataTypes.STRING,
                    default: ''
                },
                creation: {
                    type: DataTypes.DATE,
                    notNull: true,
                    defaultValue: DataTypes.NOW
                },
                expiration: {
                    type: DataTypes.DATE,
                    notNull: true,
                    defaultValue: new Date(0)
                },
                adminSteamID: {
                    type: DataTypes.STRING,
                    notNull: true
                },
                evidence: {
                    type: DataTypes.STRING,
                }
            },
            {
                charset: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci'
            }
        );

        this.onChatMessage = this.onChatMessage.bind(this);
        this.onPlayerConnected = this.onPlayerConnected.bind(this);
        this.formatReason = this.formatReason.bind(this);
        this.addBan = this.addBan.bind(this);
        this.removeBan = this.removeBan.bind(this);
        this.createModel = this.createModel.bind(this);
        this.getExpiration = this.getExpiration.bind(this);
        this.getPlayersByUsername = this.getPlayersByUsername.bind(this);
        this.getPlayerBySteamID = this.getPlayerBySteamID.bind(this);

        this.broadcast = (msg) => { this.server.rcon.broadcast(msg); };
        this.warn = (steamid, msg) => { this.server.rcon.warn(steamid, msg); };
        this.kick = (steamid, reason) => { this.server.rcon.execute(`AdminKick ${steamid} ${reason}`) }
    }

    async mount() {
        this.verbose(1, 'Mounted.');
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    }

    async unmount() {
        this.verbose(1, 'Un-mounted.');
    }

    async prepareToMount() {
        await this.models.Bans.sync();
    }

    async onChatMessage(info) {
        const { steamID, name: playerName } = info;
        const message = info.message.toLowerCase();
        const isAdmin = info.chat === "ChatAdmin";

        if (!message.startsWith(this.options.commandPrefix)) return;

        if (!isAdmin) return;

        const commandSplit = message.substring(this.options.commandPrefix.length).trim().split(' ');
        const subCommand = commandSplit[ 0 ];

        switch (subCommand) {
            case 'add':
                if (!isAdmin) return;
                let banPlayers = [];
                const banPlayerSteamID = commandSplit[ 1 ].length == 17 ? this.getPlayerBySteamID(commandSplit[ 1 ]) : null;

                if (!banPlayerSteamID) banPlayers = this.getPlayersByUsername(commandSplit[ 1 ]);
                else banPlayers.push(banPlayerSteamID);

                if (banPlayers.length == 0) {
                    this.warn(steamID, `Could not find a player whose ${banPlayerSteamID ? "username includes" : "SteamID is"}: "${commandSplit[ 1 ]}"`)
                    return;
                }
                if (banPlayers.length > 1) {
                    this.warn(steamID, `Found multiple players whose usernames include: "${commandSplit[ 1 ]}"`)
                    return;
                }
                const player = banPlayers[ 0 ];
                if (steamID == player.steamID) {
                    this.warn(steamID, `You cannot ban yourself...`);
                    return;
                }

                this.addBan(steamID, player.name, player.steamID, this.getExpiration(commandSplit[ 2 ]), commandSplit.slice(3).join(' '));
                break;
            case 'remove':
                if (await this.removeBan(commandSplit[ 1 ]))
                    this.warn(steamID, `Successfully removed ban`)
                else
                    this.warn(steamID, `Could not remove ban`)
                break;
            case 'help':
                if (!isAdmin) return;
                let msg = `!${this.options.commandPrefix}\n > add {username} {days} {reason}`;
                this.warn(steamID, msg);
                break;
            default:
                this.warn(steamID, `Unknown vote subcommand: ${subCommand}`);
                return;
        }
    }

    async onPlayerConnected(dt) {
        const ban = await this.models.Bans.findOne({
            where: {
                steamID: dt.steamID,
                expiration: { [ Op.gt ]: new Date() }
            }
        });

        if (ban) {
            this.kick(ban.steamID, this.formatReason(ban))
        }
    }

    formatReason(ban) {
        const duration = Math.max(1, Math.round((ban.expiration - (new Date())) / 1000 / 3600 / 24)) + 'D';
        return this.options.banMessageFormat.replace(/\{reason\}/gi, ban.reason).replace(/\{duration\}/gi, duration).replace(/\{ban_id\}/gi, ban.id)
    }

    getPlayersByUsername(username) {
        return this.server.players.filter(p =>
            p.name.toLowerCase().includes(username.toLowerCase()) &&
            p.length / username.length < 1.6
        )
    }
    getPlayerBySteamID(steamID) {
        return this.server.players.find(p => p.steamID == steamID) || { steamID: steamID, name: 'Unknown', squadID: 'N/A', teamID: -1, playerID: -1 }
    }

    async addBan(adminSteamID, username, steamID, expiration, reason) {
        // this.server.getAdminPermsBySteamID()
        const ban = await this.models.Bans.create({
            username: username,
            steamID: steamID,
            expiration: expiration,
            reason: reason,
            adminSteamID: adminSteamID
        })
        this.kick(ban.steamID, this.formatReason(ban));
        return ban;
    }
    async removeBan(banID) {
        return await this.models.Bans.destroy({ where: { [ Op.or ]: { id: +banId, steamID: `${banID}` } }, force: true })
    }

    createModel(name, schema) {
        this.models[ name ] = this.options.database.define(`BanManager_${name}`, schema, {
            timestamps: false
        });
    }

    getExpiration(days) {
        return new Date(+(new Date()) + +(new Date(+days * 24 * 3600 * 1000)))
    }
}