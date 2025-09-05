define(["qlik", "jquery"], function (qlik, $) {
  "use strict";

  function getModeSafe() {
    try { if (qlik.navigation && qlik.navigation.getMode) return qlik.navigation.getMode(); } catch (e) {}
    var cls = document.body ? (document.body.className || "") : "";
    return /edit/i.test(cls) ? "edit" : "analysis";
  }

  function findTarget(tableId) {
    if (!tableId) return $();
    var candidates = [
      '[tid="' + tableId + '"]',
      '.qv-object-' + tableId,
      '[data-qid="' + tableId + '"]',
      '[data-cid="' + tableId + '"]',
      '#' + (window.CSS && CSS.escape ? CSS.escape(tableId) : tableId)
    ];
    for (var i=0; i<candidates.length; i++) {
      try { var $el = $(candidates[i]).first(); if ($el && $el.length) return $el; } catch (e) {}
    }
    var $guess = $('[id*="'+tableId+'"], [data-qid*="'+tableId+'"], [data-cid*="'+tableId+'"]').first();
    return $guess;
  }

  function findGridRoot($target) {
    if (!$target || !$target.length) return $();
    var $g = $target.find('[role="grid"]').first();
    if ($g.length) return $g;
    $g = $target.find('table').first();
    if ($g.length) return $g;
    return $target;
  }

  function storageKey(appId, objId) { return "rd-row-checker-session::" + appId + "::" + objId; }
  function loadChecked(appId, objId) { try { return new Set(JSON.parse(sessionStorage.getItem(storageKey(appId,objId))||"[]")); } catch(e){ return new Set(); } }
  function saveChecked(appId, objId, set) { try { sessionStorage.setItem(storageKey(appId,objId), JSON.stringify(Array.from(set))); } catch(e){} }

  function isHeaderRow($row) {
    if ($row.closest('thead').length > 0) return true;
    if ($row.find('[role="columnheader"], .qv-st-header-cell, th').length > 0) return true;
    var ariaIdx = parseInt($row.attr('aria-rowindex') || "-1", 10);
    if ($row.attr('role') === 'row' && ariaIdx === 1) return true;
    return false;
  }

  function computeSignature($row) {
    var parts = [];
    $row.children().each(function () {
      var $c = $(this);
      if ($c.hasClass('rd-check-cell')) return;
      var t = ($c.text() || "").trim();
      if (t) parts.push(t);
    });
    if (!parts.length) {
      $row.find('[role="cell"], .qv-st-data-cell, td, .value').each(function () {
        var $c = $(this);
        if ($c.closest('.rd-check-cell').length) return;
        var txt = ($(this).text() || "").trim();
        if (txt) parts.push(txt);
      });
    }
    return parts.join("||");
  }

  function hexToRgba(hex, alpha) {
    var h = (hex || '').replace('#','');
    if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
    if (h.length !== 6) return 'rgba(76,175,80,' + (alpha || 1) + ')';
    var r = parseInt(h.substr(0,2),16);
    var g = parseInt(h.substr(2,2),16);
    var b = parseInt(h.substr(4,2),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
  }

  function normalizeHex(hex) {
    var h = (hex || "").trim();
    if (!h) return "#4caf50";
    if (h[0] !== "#") h = "#" + h;
    h = h.replace(/[^#0-9A-Fa-f]/g, "");
    if (h.length === 4) {
      h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    if (h.length !== 7) return "#4caf50";
    return h;
  }

  function ensureHeaderCheckboxCell($root, position) {
    var $rows = $root.find('[role="row"], tr').filter(function () { return isHeaderRow($(this)); });
    var $header = $rows.first();
    $rows.not($header).find('.rd-check-cell').remove();
    if (!$header.length) return;
    var $chk = $header.children('.rd-check-cell');
    if ($chk.length === 0) {
      var $first = $('<div class="rd-check-cell rd-check-header" role="columnheader" aria-label="Marked"></div>');
      if ($header.is('tr')) $first = $('<th class="rd-check-cell rd-check-header" scope="col"></th>');
      $chk = $first;
    }
    // Position the header cell on the desired side
    if (position === 'right') {
      $chk.appendTo($header);
    } else {
      $chk.prependTo($header);
    }
    if ($chk.find('.rd-check-wrap').length === 0) {
      $('<div class="rd-check-wrap"></div>').appendTo($chk);
    }
    var $hdrCb = $chk.find('.rd-check');
    if ($hdrCb.length === 0) {
      $hdrCb = $('<input type="checkbox" class="rd-check rd-check-header" aria-label="Toggle all rows">').appendTo($chk.find('.rd-check-wrap'));
    }
    // Remove inline styling so CSS variables control appearance
    $hdrCb.attr('style', '');
  }

  function injectCheckboxes($root, checkedSet, appId, objId, position) {
    $root.find('[role="row"], tr').each(function () {
      var $row = $(this);
      if (isHeaderRow($row)) return;

      var $cell = $row.children('.rd-check-cell');
      if ($cell.length === 0) {
        $cell = $('<div class="rd-check-cell" role="cell"></div>');
        if ($row.is('tr')) $cell = $('<td class="rd-check-cell"></td>');
      }
      // Move or insert the checkbox cell to the correct side
      if (position === 'right') {
        $cell.appendTo($row);
      } else {
        $cell.prependTo($row);
      }
      if ($cell.find('.rd-check-wrap').length === 0) {
        $('<div class="rd-check-wrap"></div>').appendTo($cell);
      }

      var $cb = $cell.find('.rd-check');
      if ($cb.length === 0) {
        $cb = $('<input class="rd-check" type="checkbox" aria-label="Mark row">').appendTo($cell.find('.rd-check-wrap'));
      }
      // remove any inline styling so CSS variables control appearance
      $cb.attr('style', '');

      // Sync state from storage
      var sig = $row.attr('data-row-signature');
      if (!sig) { sig = computeSignature($row); $row.attr('data-row-signature', sig); }
      var isChecked = sig && checkedSet.has(sig);
      $row.toggleClass('rd-checked-row', !!isChecked);
      $cb.prop('checked', !!isChecked);
    });
  }

  function refresh($grid, checkedSet, appId, objId, position) {
    if (!$grid || !$grid.length) return;
    ensureHeaderCheckboxCell($grid, position);
    injectCheckboxes($grid, checkedSet, appId, objId, position);
    syncHeaderCheckbox($grid, checkedSet);
  }

  function setAllRows($grid, checkedSet, checked) {
    $grid.find('[role="row"], tr').each(function () {
      var $row = $(this);
      if (isHeaderRow($row)) return;
      var $cb = $row.find('.rd-check');
      var sig = $row.attr('data-row-signature');
      if (!sig) { sig = computeSignature($row); $row.attr('data-row-signature', sig); }
      if (checked) { checkedSet.add(sig); } else { checkedSet.delete(sig); }
      $cb.prop('checked', checked);
      $row.toggleClass('rd-checked-row', checked);
    });
  }

  function syncHeaderCheckbox($grid, checkedSet) {
    var $hdr = $grid.find('.rd-check-header .rd-check');
    if ($hdr.length) {
      $hdr.prop('checked', checkedSet.size > 0);
    }
  }

  function bindDelegatedHandlers($grid, checkedSet, appId, objId, burst) {
    // One-time delegated handler so all current/future checkboxes are responsive
    $grid.off('change.rd').on('change.rd', '.rd-check', function (e) {
      e.stopPropagation();
      var $cb = $(this);
      if ($cb.closest('.rd-check-header').length) {
        var chk = $cb.is(':checked');
        setAllRows($grid, checkedSet, chk);
        saveChecked(appId, objId, checkedSet);
        syncHeaderCheckbox($grid, checkedSet);
        burst && burst();
        return;
      }
      var $row = $cb.closest('[role="row"], tr');
      var sig = $row.attr('data-row-signature') || computeSignature($row);
      if (!sig) return;
      var isChecked = $cb.is(':checked');
      if (isChecked) {
        checkedSet.add(sig);
        $row.addClass('rd-checked-row');
      } else {
        checkedSet.delete(sig);
        $row.removeClass('rd-checked-row');
      }
      saveChecked(appId, objId, checkedSet);
      syncHeaderCheckbox($grid, checkedSet);
      burst && burst();
    });
  }

  function debouncedBurst(doRefresh) {
    var t1, t2, t3, t4;
    return function () {
      try { doRefresh(); } catch (e) {}
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      t1 = setTimeout(doRefresh, 50);
      t2 = setTimeout(doRefresh, 250);
      t3 = setTimeout(doRefresh, 750);
      t4 = setTimeout(doRefresh, 1500);
    };
  }

  return {
    initialProperties: { version: 2.3 },
    definition: {
      type: "items",
      component: "accordion",
      items: {
        settings: {
          uses: "settings",
          items: {
            tableId: { ref: "props.tableId", type: "string", label: "Target Table Object ID", expression: "optional" },
            checkColor: { ref: "props.checkColor", type: "string", label: "Check Color (hex)", defaultValue: "#4caf50" },
            checkAlign: {
              ref: "props.checkAlign",
              type: "string",
              component: "dropdown",
              label: "Checkbox Alignment",
              defaultValue: "center",
              options: [
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" }
              ]
            },
            checkPosition: {
              ref: "props.checkPosition",
              type: "string",
              component: "dropdown",
              label: "Checkbox Column Position",
              defaultValue: "left",
              options: [
                { value: "left", label: "Left" },
                { value: "right", label: "Right" }
              ]
            },
            hideInAnalysis: { ref: "props.hideInAnalysis", type: "boolean", label: "Hide this helper in analysis mode", defaultValue: true }
          }
        }
      }
    },
    support: { snapshot: false, export: false, exportData: false },
    paint: function ($element, layout) {
      var mode = getModeSafe();
      var props = layout.props || {};
      var tableId = props.tableId || "";
      var checkColor = normalizeHex(props.checkColor || "#4caf50");
      var checkBg = hexToRgba(checkColor, 0.25);
      var align = (props.checkAlign || 'center').toLowerCase();
      var position = (props.checkPosition || 'left').toLowerCase();
      var hideInAnalysis = (props.hideInAnalysis !== false);

      // Collapse helper in analysis (hide container as well)
      var $containers = $element.parents().addBack().filter('.qv-object, .qv-object-wrapper, .qv-visualization, .object');
      if (!$containers.length) $containers = $element;
      $containers.addClass('rd-helper');
      if (hideInAnalysis && mode !== 'edit') { $containers.addClass('rd-helper-hide').hide(); } else { $containers.removeClass('rd-helper-hide').show(); }

      var self = this;
      var $target = findTarget(tableId);
      if (!$target || !$target.length) {
        if (!self._rdRetry) {
          self._rdRetry = setInterval(function(){ self.paint($element, layout); }, 1000);
        }
        if (mode === "edit") $element.html('<div class="rd-hint">Row Checker: set a valid Target Table Object ID. Looking for: ' + (tableId || '(none)') + '</div>');
        else $element.empty();
        return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
      }
      if (self._rdRetry) { clearInterval(self._rdRetry); self._rdRetry = null; }

      if (self._rdPrevTarget && self._rdPrevTarget.get(0) !== $target.get(0)) {
        try { self._rdPrevTarget.removeClass('rd-row-checker-target'); self._rdPrevTarget.find('.rd-check-cell').remove(); } catch(e){}
      }
      self._rdPrevTarget = $target;

      var $grid = findGridRoot($target);
      $target.addClass('rd-row-checker-target');
      try {
        var checkWidth = 32;
        var order = position === 'right' ? 9999 : -1;
        var justify = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');
        [$grid.get(0), $target.get(0)].forEach(function(el){ if (el) {
          el.style.setProperty('--rd-check-color', checkColor);
          el.style.setProperty('--rd-check-bg', checkBg);
          el.style.setProperty('--rd-check-width', checkWidth + 'px');
          el.style.setProperty('--rd-check-order', order);
          el.style.setProperty('--rd-check-justify', justify);
        } });
      } catch(e){}

      var app = qlik.currApp && qlik.currApp(this);
      var appId = (app && app.model && app.model.id) || (app && app.id) || "app";
      var checked = loadChecked(appId, tableId);

      var doRefresh = function () { refresh($grid, checked, appId, tableId, position); };
      var burst = debouncedBurst(doRefresh);
      burst();

      // Delegated handlers (bind once)
      bindDelegatedHandlers($grid, checked, appId, tableId, burst);

      // Observers
      if (self._rdObs1) try { self._rdObs1.disconnect(); } catch(e){}
      if (self._rdObs2) try { self._rdObs2.disconnect(); } catch(e){}
      if (self._rdResize) try { self._rdResize.disconnect(); } catch(e){}

      var obs1 = new MutationObserver(burst);
      try { obs1.observe($grid.get(0), { childList: true, subtree: true }); } catch(e){}
      self._rdObs1 = obs1;

      var obs2 = new MutationObserver(burst);
      try { obs2.observe(document.body, { childList: true, subtree: true }); } catch(e){}
      self._rdObs2 = obs2;

      if (window.ResizeObserver) {
        var ro = new ResizeObserver(burst);
        try { ro.observe($grid.get(0)); } catch(e){}
        self._rdResize = ro;
      }

      if (self._rdInterval) { clearInterval(self._rdInterval); }
      self._rdInterval = setInterval(doRefresh, 2000);

      if (typeof this.on === 'function') {
        this.on('destroy', function () {
          try { obs1 && obs1.disconnect(); } catch(e){}
          try { obs2 && obs2.disconnect(); } catch(e){}
          try { self._rdResize && self._rdResize.disconnect(); } catch(e){}
          try { clearInterval(self._rdInterval); } catch(e){}
          try { clearInterval(self._rdRetry); self._rdRetry = null; } catch(e){}
          try { $grid.off('click.rd'); } catch(e){}
        });
      }

      return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
    }
  };
});
