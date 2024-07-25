# Google Ads Budget Alert Script

This repository contains a script that checks the account level budget and spend
for a given account and sends an e-mail alert to a given list of e-mails when
spend reaches a certain set of given threshold(s).

## Parameters

The following values will be required before the script can run: 

    THRESHOLDS - comma-separated list of budget thresholds (percentage of total budget), expressed in decimal.
    RECEPIENT_EMAIL - comma-separated list of emails for those who need to get the budget alert notifications.  NOTE: please ensure the e-mails are correct as the recipients will receive budget information.

## license

Apache 2.0

This is not an official Google product.
