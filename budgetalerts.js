/***********************************************************************
    Copyright 2024 Google LLC
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
        https://www.apache.org/licenses/LICENSE-2.0
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

    This script checks the account level budget and spend for a given
    account and sends an e-mail alert to a given list of e-mails when
    spend reaches a certain set of given threshold(s).
************************************************************************/

/**
 * Thresholds and recepient e-mails for the budget alert script that must be edited.
 * Replace the following:
 *   thresholds - Comma-separated list of threshold percentages in decimal.
 *   RECEPIENT_EMAIL - Comma-separated list of e-mails.
 */
const THRESHOLDS = ['<comma-separated list of thresholds>']; // Replace with your thresholds.
const RECIPIENT_EMAIL = '<comma-separated list of recipient emails>'; // Replace with your recipient emails.

// Empty list created to store alert messages in the body.
var warnings = [];

const MICROS = 1000000;

/**
 * Sorts warning rows by specified column.
 * This functions takes 4 parameters:
 * @param arr The 2 dimensional array that needs to be sorted.
 * @param columnIndices The order the columns should be sorted in.
 * @param ascending Boolean indicating sorted column to be ascending or descending.
 * @param dataTypes Data types of each column to be sorted.
 */
function sortByMultipleColumns(arr, columnIndices, ascendingOrders = [], dataTypes = []) {
  // Fill missing sort orders and data types with defaults
  while (ascendingOrders.length < columnIndices.length) ascendingOrders.push(true);
  while (dataTypes.length < columnIndices.length) dataTypes.push('string');

  return arr.sort((a, b) => {
    for (let i = 0; i < columnIndices.length; i++) {
      const columnIndex = columnIndices[i];
      const ascending = ascendingOrders[i];
      const dataType = dataTypes[i];

      let x = a[columnIndex];
      let y = b[columnIndex];

      if (dataType === 'number') {
        x = parseFloat(x);
        y = parseFloat(y);
      } else if (dataType === 'date') {
        x = new Date(x);
        y = new Date(y);
      }

      if (x < y) {
        return ascending ? -1 : 1;
      } else if (x > y) {
        return ascending ? 1 : -1;
      }
    }
    return 0; // Rows are equal up to the specified columns
  });
}

/**
 * Pulls account budget from Budget Performance Report and checks if
 * each budget has reached a threshold.
 */
function checkBudget() {

  var date = new Date();
  var firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  firstDayOfMonth = firstDayOfMonth.toISOString().slice(0, 10).replaceAll('-','');

  var lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  lastDayOfMonth = lastDayOfMonth.toISOString().slice(0, 10).replaceAll('-','');

  Logger.log('Current month: ' + firstDayOfMonth + ' to ' + lastDayOfMonth);

  const query = `
    SELECT
      customer.id,
      account_budget.name,
      account_budget.id,
      account_budget.adjusted_spending_limit_micros,
      account_budget.amount_served_micros,
      account_budget.status,
      account_budget.approved_spending_limit_micros,
      account_budget.approved_spending_limit_type,
      account_budget.approved_start_date_time,
      account_budget.approved_end_date_time,
      account_budget.purchase_order_number,
      account_budget.total_adjustments_micros,
      customer.currency_code
    FROM account_budget
    WHERE
      account_budget.status = 'APPROVED' AND
      account_budget.approved_start_date_time <= ${firstDayOfMonth} AND
      account_budget.approved_end_date_time >= ${lastDayOfMonth}
  `;

  var report = AdsApp.report(query);
  var rows = report.rows();
  Logger.log(rows);

  var threshold = 0;

  THRESHOLDS.sort().reverse();
  Logger.log(`Thresholds are: ${THRESHOLDS}`);

  // Loops through every active budget and check for threshold.
  while (rows.hasNext()) {
    var row = rows.next();

    var budgetName = row['account_budget.name'];
    var budgetId = row['account_budget.id'];
    var budgetAmount  = row['account_budget.adjusted_spending_limit_micros'] / MICROS;
    var budgetCost = row['account_budget.amount_served_micros'] / MICROS;
    var budgetStartDate = row['account_budget.approved_start_date_time'].split(' ')[0];
    var budgetEndDate = row['account_budget.approved_end_date_time'].split(' ')[0];

    Logger.log(`Customer Id: ${row['customer.id']}`);
    Logger.log(`Budget Name: ${budgetName}`);
    Logger.log(`Budget Id: ${budgetId}`);
    Logger.log(`Budget Adjusted Amount: ${budgetAmount}`);
    Logger.log(`Budget Spend: ${budgetCost}`);
    Logger.log(`Budget Status: ${row['account_budget.status']}`);
    Logger.log(`Budget Approved Amount: ${row['account_budget.approved_spending_limit_micros'] / MICROS}`);
    Logger.log(`Budget Approved Spending Limit Type: ${row['account_budget.approved_spending_limit_type']}`);
    Logger.log(`Budget Approved Start Date: ${budgetStartDate}`);
    Logger.log(`Budget Approved End Date: ${budgetEndDate}`);
    Logger.log(`Budget Purchase Order: ${row['account_budget.purchase_order_number']}`);
    Logger.log(`Budget Total Adjustments Amount: ${row['account_budget.total_adjustments_micros'] / MICROS}`);
    Logger.log(`Budget Currency: ${row['customer.currency_code']}`);

    // Loop through all the thresholds (reverse sorted from above) to find the highest
    // threshold it reached.
    for(var i = 0; i < THRESHOLDS.length; i++) {
      threshold = (budgetCost / budgetAmount).toFixed(4);

      if(threshold >= THRESHOLDS[i]) {
        Logger.log(`Threshold Reached is: ${threshold}`);
        warnings.push([budgetName, budgetId, budgetAmount, budgetCost, budgetStartDate, budgetEndDate, threshold, THRESHOLDS[i]]);
        break;
      }
    }
  }

  sortByMultipleColumns(warnings, [7, 6, 5, 2, 3, 0], [false, false, false, false, false, true] , ['number', 'number', 'string', 'number', 'number', 'string']);
    Logger.log(`Sorted warnings: ${warnings}`);
}

/*
 * Sends an e-mail when a threshold is reached with all the warning messages.
 */
function sendEmail() {

  var customerId = AdsApp.currentAccount().getCustomerId();
  var SUBJECT = '[ATTENTION] Threshold Reached For the Following Google Ads Budgets.  Customer Id: ' + customerId;
  var BODY = "The following budget(s) have reached its threshold:<br/><br/>" +
             "<table style='border: 1px solid black; padding: 5px; text-align: center;'><tr>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget Name</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget Id</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget Amount</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget Spend</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget Start Date</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Budget End Date</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Percent of Budget Spent</th>" +
             "<th style='border: 1px solid black; padding: 5px; text-align: center;'>Threshold Reached</th></tr>";

  for (var i = 0; i < warnings.length; i++) {
    BODY += `<tr><td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][0]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][1]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>$${warnings[i][2]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>$${warnings[i][3]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][4]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][5]}</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][6]*100}%</td>` +
            `<td style='border: 1px solid black; padding: 5px; text-align: center;'>${warnings[i][7]*100}%</td></tr>`;
  }

  BODY += '</table>';

  Logger.log(BODY);

  MailApp.sendEmail({to: RECIPIENT_EMAIL, subject: SUBJECT, htmlBody: BODY});
}

function main() {

  checkBudget();

  Logger.log(`Warnings: ${warnings}`);
  warnings.length > 0?sendEmail():Logger.log("No budgets in threshold");

}