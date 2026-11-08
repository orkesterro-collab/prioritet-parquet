/**
 * Add to the existing Apps Script project serving the pricing/FAQ endpoint.
 * Add partners: readPrioritetPartners_() to its existing JSON response object.
 * Preserve prices and faq, then deploy a new version of the same Web App.
 */
function readPrioritetPartners_() {
  var book = SpreadsheetApp.openById('1L7CZVqNSuMuBWXLAD51Wxn8GET1mOwqJL2ClbKukXEE');
  var sheet = book.getSheetByName('Partners');
  if (!sheet) throw new Error('Partners sheet is missing');
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(1, 1, sheet.getLastRow(), 12).getValues();
  var headers = rows.shift().map(function(v) { return String(v).trim(); });
  function val(row, name) { var i = headers.indexOf(name); return i < 0 ? '' : row[i]; }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function coordinate(v) { return v === '' ? null : Number(String(v).replace(',', '.')); }
  return rows.filter(function(row) {
    return val(row, 'Публиковать') === true && text(val(row, 'Салон')) && text(val(row, 'Город')) && text(val(row, 'Адрес'));
  }).map(function(row) {
    var city=text(val(row,'Город')), name=text(val(row,'Салон')), address=text(val(row,'Адрес'));
    return {
      id:city+'|'+name+'|'+address, active:true, city:city, name:name, address:address,
      phone:text(val(row,'Телефон')), hours:text(val(row,'Часы работы')),
      website:text(val(row,'Сайт')), lat:coordinate(val(row,'Широта')), lng:coordinate(val(row,'Долгота')),
      map_url:text(val(row,'Ссылка на карту')), description:text(val(row,'Информация для посетителя')),
      sort_order:Number(val(row,'Порядок'))||0
    };
  });
}
