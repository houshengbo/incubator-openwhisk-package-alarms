// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

module.exports = function(logger, utils) {

    var self = this;

    this.deleteTriggerFromDB = function(triggerID, retryCount) {
        var method = 'deleteTriggerFromDB';

        //delete from database
        utils.db.get(triggerID, function (err, existing) {
            if (!err) {
                utils.db.destroy(existing._id, existing._rev, function (err) {
                    if (err) {
                        if (err.statusCode === 409 && retryCount < 5) {
                            setTimeout(function () {
                                self.deleteTriggerFromDB(triggerID, (retryCount + 1));
                            }, 1000);
                        }
                        else {
                            logger.error(method, triggerID, 'there was an error deleting the trigger from the database');
                        }
                    }
                    else {
                        logger.info(method, triggerID, 'trigger was successfully deleted from the database');
                    }
                });
            }
            else {
                logger.error(method, triggerID, 'could not find the trigger in the database');
            }
        });
    };

    this.deleteTriggerAndRules = function(triggerData) {
        var method = 'deleteTriggerAndRules';

        var triggerIdentifier = triggerData.triggerID;
        utils.authRequest(triggerData, {
            method: 'get',
            uri: triggerData.uri
        }, function(error, response, body) {
            logger.info(method, triggerIdentifier, 'http get request, STATUS:', response ? response.statusCode : undefined);

            if (error || response.statusCode >= 400) {
                logger.error(method, triggerIdentifier, 'trigger get request failed');
            }
            else {
                //delete the trigger
                self.deleteTrigger(triggerData, 0)
                .then((info) => {
                    logger.info(method, triggerIdentifier, info);
                    if (body) {
                        try {
                            var jsonBody = JSON.parse(body);
                            for (var rule in jsonBody.rules) {
                                var qualifiedName = rule.split('/');
                                var uri = utils.uriHost + '/api/v1/namespaces/' + qualifiedName[0] + '/rules/' + qualifiedName[1];
                                self.deleteRule(triggerData, rule, uri, 0);
                            }
                        }
                        catch (err) {
                            logger.error(method, triggerIdentifier, err);
                        }
                    }
                })
                .catch(err => {
                    logger.error(method, triggerIdentifier, err);
                });
            }
        });
    };

    this.deleteTrigger = function(triggerData, retryCount) {
        var method = 'deleteTrigger';

        return new Promise(function(resolve, reject) {

            var triggerIdentifier = triggerData.triggerID;
            utils.authRequest(triggerData, {
                method: 'delete',
                uri: triggerData.uri
            }, function (error, response) {
                logger.info(method, triggerIdentifier, 'http delete request, STATUS:', response ? response.statusCode : undefined);
                if (error || response.statusCode >= 400) {
                    if (!error && response.statusCode === 409 && retryCount < 5) {
                        logger.info(method, 'attempting to delete trigger again', triggerIdentifier, 'Retry Count:', (retryCount + 1));
                        setTimeout(function () {
                            self.deleteTrigger(triggerData, (retryCount + 1))
                            .then(info => {
                                resolve(info);
                            })
                            .catch(err => {
                                reject(err);
                            });
                        }, 1000);
                    } else {
                        reject('trigger delete request failed');
                    }
                }
                else {
                    resolve('trigger delete request was successful');
                }
            });
        });
    };

    this.deleteRule = function(triggerData, rule, uri, retryCount) {
        var method = 'deleteRule';

        utils.authRequest(triggerData, {
            method: 'delete',
            uri: uri
        }, function(error, response) {
            logger.info(method, rule, 'http delete rule request, STATUS:', response ? response.statusCode : undefined);
            if (error || response.statusCode >= 400) {
                if (!error && response.statusCode === 409 && retryCount < 5) {
                    logger.info(method, 'attempting to delete rule again', rule, 'Retry Count:', (retryCount + 1));
                    setTimeout(function () {
                        self.deleteRule(triggerData, rule, uri, (retryCount + 1));
                    }, 1000);
                } else {
                    logger.error(method, rule, 'rule delete request failed');
                }
            }
            else {
                logger.info(method, rule, 'rule delete request was successful');
            }
        });
    };

    this.deleteTriggerFeed = function(triggerID) {
        var method = 'deleteTriggerFeed';

        return new Promise(function(resolve, reject) {
            utils.db.get(triggerID, function (err, existing) {
                if (!err) {
                    var updatedTrigger = existing;
                    var status = {
                        'active': false,
                        'dateChanged': Date.now(),
                        'reason': {'kind': 'AUTO', 'statusCode': undefined, 'message': `Marked for deletion`}
                    };
                    updatedTrigger.status = status;

                    utils.db.insert(updatedTrigger, triggerID, function (err) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(triggerID);
                        }
                    });
                }
                else {
                    reject(err);
                }
            });
        })
        .then(triggerID => {
            self.deleteTriggerFromDB(triggerID, 0);
        })
        .catch(err => {
            logger.error(method, triggerID, 'an error occurred while deleting the trigger feed', err);
        });

    };

};
