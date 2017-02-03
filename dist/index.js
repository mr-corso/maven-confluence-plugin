"use strict";
var confluence_xmlrpc_1 = require("./confluence-xmlrpc");
var confluence_site_1 = require("./confluence-site");
var config_1 = require("./config");
var path = require("path");
var util = require("util");
var chalk = require("chalk");
var minimist = require("minimist");
var Rx = require("rx");
var figlet = require('figlet');
var LOGO = 'Confluence CLI';
var LOGO_FONT = 'Stick Letters';
var rxFiglet = Rx.Observable.fromNodeCallback(figlet);
var argv = process.argv.slice(2);
var args = minimist(argv, {});
var commands;
(function (commands) {
    function deploy() {
        rxFiglet(LOGO)
            .doOnNext(function (logo) { return console.log(chalk.magenta(logo)); })
            .map(function (logo) { return args['config'] || false; })
            .flatMap(config_1.rxConfig)
            .flatMap(function (result) { return rxConfluenceConnection(result[0], result[1]); })
            .flatMap(function (result) { return rxGenerateSite(result[1], result[0]); })
            .subscribe(function (result) { }, function (err) { return console.error(err); });
    }
    commands.deploy = deploy;
    function config() {
        rxFiglet(LOGO)
            .doOnNext(function (logo) { return console.log(chalk.magenta(logo)); })
            .map(function (logo) { return args['update'] || false; })
            .flatMap(config_1.rxConfig)
            .subscribe(function (value) { }, function (err) { return console.error(err); });
    }
    commands.config = config;
    function remove() {
        rxFiglet(LOGO)
            .doOnNext(function (logo) { return console.log(chalk.magenta(logo)); })
            .map(function () { return false; })
            .flatMap(config_1.rxConfig)
            .flatMap(function (result) { return rxConfluenceConnection(result[0], result[1]); })
            .flatMap(function (result) { return rxDelete(result[0], result[1]); })
            .subscribe(function (value) { console.log("# page(s) removed ", value); }, function (err) { return console.error(err); });
    }
    commands.remove = remove;
})(commands || (commands = {}));
clrscr();
var command = (args._.length === 0) ? "help" : args._[0];
switch (command) {
    case "deploy":
        commands.deploy();
        break;
    case "config":
        commands.config();
        break;
    case "delete":
        commands.remove();
        break;
    default:
        usage();
}
function clrscr() {
    process.stdout.write('\x1Bc');
}
function usageCommand(cmd, desc) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    desc = chalk.italic.gray("// " + desc);
    return args.reduce(function (previousValue, currentValue, currentIndex, array) {
        return util.format("%s %s", previousValue, chalk.yellow(currentValue));
    }, "\n\n" + cmd) + "\t" + desc;
}
function usage() {
    rxFiglet(LOGO, LOGO_FONT)
        .doOnCompleted(function () { return process.exit(-1); })
        .subscribe(function (logo) {
        console.log(chalk.bold.magenta(logo), "\n" +
            chalk.cyan("Usage:") +
            " confluence-cli " +
            usageCommand("deploy", "deploy site to confluence", "[--config]") +
            usageCommand("config", "show/create/update configuration", "[--update]") +
            usageCommand("delete", "delete page tree") +
            "\n\n" +
            chalk.cyan("Options:") +
            "\n\n" +
            " --config | --update\t" + chalk.italic.gray("// force reconfiguration"));
    });
}
function newSiteProcessor(confluence, config) {
    var siteHome = (path.isAbsolute(config.sitePath)) ?
        path.dirname(config.sitePath) :
        path.join(process.cwd(), path.dirname(config.sitePath));
    var site = new confluence_site_1.SiteProcessor(confluence, config.spaceId, config.parentPageTitle, siteHome);
    return site;
}
function rxConfluenceConnection(config, credentials) {
    var service = confluence_xmlrpc_1.XMLRPCConfluenceService.create(config, credentials);
    var rxConnection = Rx.Observable.fromPromise(service);
    var rxCfg = Rx.Observable.just(config);
    return Rx.Observable.combineLatest(rxConnection, rxCfg, function (conn, conf) { return [conn, conf]; });
}
function rxDelete(confluence, config) {
    var siteFile = path.basename(config.sitePath);
    var site = newSiteProcessor(confluence, config);
    var rxParentPage = Rx.Observable.fromPromise(confluence.getPage(config.spaceId, config.parentPageTitle));
    var rxParseSite = site.rxParse(siteFile);
    return Rx.Observable.combineLatest(rxParentPage, rxParseSite, function (parent, home) { return [parent, home]; })
        .flatMap(function (result) {
        var parent = result[0], pages = result[1];
        var first = pages[0];
        var getHome = Rx.Observable.fromPromise(confluence.getPageByTitle(parent.id, first.$.name));
        return getHome
            .filter(function (home) { return home != null; })
            .flatMap(function (home) {
            return Rx.Observable.fromPromise(confluence.getDescendents(home.id))
                .flatMap(Rx.Observable.fromArray)
                .flatMap(function (page) { return Rx.Observable.fromPromise(confluence.removePageById(page.id))
                .doOnNext(function (r) { return console.log("page:", page.title, "removed!", r); }); })
                .reduce(function (acc, x) { return ++acc; }, 0)
                .flatMap(function (n) {
                return Rx.Observable.fromPromise(confluence.removePageById(home.id))
                    .doOnNext(function (r) { return console.log("page:", home.title, "removed!", r); })
                    .map(function (value) { return ++n; });
            });
        });
    });
}
function rxGenerateSite(config, confluence) {
    var siteFile = path.basename(config.sitePath);
    var site = newSiteProcessor(confluence, config);
    return site.rxStart(siteFile)
        .doOnCompleted(function () { return confluence.connection.logout().then(function () {
    }); });
}
