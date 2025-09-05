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

  function ensureHeaderCheckboxCell($root, colWidth) {
    $root.find('[role="row"], tr').each(function () {
      var $row = $(this);
      if (!isHeaderRow($row)) return;
      var $chk = $row.children('.rd-check-cell');
      if ($chk.length === 0) {
        var $first = $('<div class="rd-check-cell rd-check-header" role="columnheader" aria-label="Marked"></div>');
        if ($row.is('tr')) $first = $('<th class="rd-check-cell rd-check-header" scope="col"></th>');
        $chk = $first.prependTo($row);
      }
      $chk.css({ width: colWidth, minWidth: colWidth, maxWidth: colWidth, flex: '0 0 ' + colWidth });
    });
  }

  function injectCheckboxes($root, checkedSet, appId, objId, colWidth) {
    $root.find('[role="row"], tr').each(function () {
      var $row = $(this);
      if (isHeaderRow($row)) return;

      var $cell = $row.children('.rd-check-cell');
      if ($cell.length === 0) {
        $cell = $('<div class="rd-check-cell" role="cell"></div>');
        if ($row.is('tr')) $cell = $('<td class="rd-check-cell"></td>');
        $row.prepend($cell);
      }
      // Apply width every time so property changes take effect
      $cell.css({ width: colWidth, minWidth: colWidth, maxWidth: colWidth, flex: '0 0 ' + colWidth });

      var $cb = $cell.find('.rd-check');
      if ($cb.length === 0) {
        $cb = $('<input class="rd-check" type="checkbox" aria-label="Mark row">').appendTo($cell);
      }

      // Sync state from storage
      var sig = $row.attr('data-row-signature');
      if (!sig) { sig = computeSignature($row); $row.attr('data-row-signature', sig); }
      var isChecked = sig && checkedSet.has(sig);
      $row.toggleClass('rd-checked-row', !!isChecked);
      $cb.prop('checked', !!isChecked);
    });
  }

  function refresh($grid, checkedSet, appId, objId, colWidth) {
    if (!$grid || !$grid.length) return;
    ensureHeaderCheckboxCell($grid, colWidth);
    injectCheckboxes($grid, checkedSet, appId, objId, colWidth);
  }

  function bindDelegatedHandlers($grid, checkedSet, appId, objId) {
    // One-time delegated handler so all current/future checkboxes are responsive
    $grid.off('change.rd').on('change.rd', '.rd-check', function (e) {
      e.stopPropagation();
      var $cb = $(this);
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
            checkColor: { ref: "props.checkColor", type: "string", label: "Checked Row Color (CSS)", defaultValue: "rgba(76,175,80,0.25)" },
            checkColWidth: { ref: "props.checkColWidth", type: "string", label: "Checkbox Column Width (CSS)", defaultValue: "16px" },
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
      var checkColor = props.checkColor || "rgba(76,175,80,0.25)";
      var colWidth = props.checkColWidth || "16px";
      if (/^\d+$/.test(colWidth)) colWidth += "px";
      var hideInAnalysis = (props.hideInAnalysis !== false);

      // Collapse helper in analysis
      $element.addClass("rd-helper");
      if (hideInAnalysis && mode !== "edit") $element.addClass("rd-helper-hide"); else $element.removeClass("rd-helper-hide");

      var $target = findTarget(tableId);
      if (!$target || !$target.length) {
        if (mode === "edit") $element.html('<div class="rd-hint">Row Checker: set a valid Target Table Object ID. Looking for: ' + (tableId || '(none)') + '</div>');
        else $element.empty();
        return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
      }

      var $grid = findGridRoot($target);
      $target.addClass('rd-row-checker-target');
      try {
        var el = ($grid.get(0) || $target.get(0));
        el.style.setProperty('--rd-check-color', checkColor);
        el.style.setProperty('--rd-check-col-width', colWidth);
      } catch(e){}

      var app = qlik.currApp && qlik.currApp(this);
      var appId = (app && app.model && app.model.id) || (app && app.id) || "app";
      var checked = loadChecked(appId, tableId);

      var doRefresh = function () { refresh($grid, checked, appId, tableId, colWidth); };
      var burst = debouncedBurst(doRefresh);
      burst();

      // Delegated handlers (bind once)
      bindDelegatedHandlers($grid, checked, appId, tableId);

      // Observers
      var self = this;
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
          try { $grid.off('click.rd'); } catch(e){}
        });
      }

      return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
    }
  };
});
