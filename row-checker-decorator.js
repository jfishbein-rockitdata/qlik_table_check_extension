
define(["qlik", "jquery"], function (qlik, $) {
  "use strict";

  function getMode() {
    try { return qlik.navigation.getMode(); } catch (e) {}
    return /edit/i.test((document.body && document.body.className) || "") ? "edit" : "analysis";
  }

  function findTarget(id) {
    if (!id) return $();
    var sels = [
      '[tid="'+id+'"]', '.qv-object-'+id, '[data-qid="'+id+'"]', '[data-cid="'+id+'"]',
      '#' + (window.CSS && CSS.escape ? CSS.escape(id) : id)
    ];
    for (var i=0; i<sels.length; i++) { try { var $t = $(sels[i]).first(); if ($t && $t.length) return $t; } catch(e){} }
    return $('[id*="'+id+'"], [data-qid*="'+id+'"], [data-cid*="'+id+'"]').first();
  }

  function gridRoot($target) {
    if (!$target || !$target.length) return $();
    var $g = $target.find('[role="grid"]').first(); if ($g.length) return $g;
    $g = $target.find('table').first(); if ($g.length) return $g;
    return $target;
  }

  function isTable($g) { return $g.is('table'); }

  function headerRow($g) {
    var $h = $g.find('[role="rowgroup"][aria-label="Header"] > [role="row"]').first();
    if ($h.length) return $h;
    return $g.find('thead > tr').first();
  }
  function bodyRows($g) {
    var $b = $g.find('[role="rowgroup"]:not([aria-label="Header"]) > [role="row"]');
    if ($b.length) return $b;
    return $g.find('tbody > tr');
  }

  function rowCells($row) {
    var $c = $row.children('[role="cell"], [role="columnheader"], td, th');
    if (!$c.length) $c = $row.children();
    return $c;
  }

  function computeSig($row) {
    var acc = [];
    rowCells($row).each(function(){
      var $c = $(this);
      if ($c.hasClass('rc-check-cell')) return;
      var t = ($c.text() || "").trim();
      if (t) acc.push(t);
    });
    return acc.join("||");
  }

  function storageKey(appId, objId){ return "rd-row-checker-session::"+appId+"::"+objId; }
  function loadSet(appId, objId){ try{ return new Set(JSON.parse(sessionStorage.getItem(storageKey(appId,objId))||"[]")); }catch(e){ return new Set(); } }
  function saveSet(appId, objId, set){ try{ sessionStorage.setItem(storageKey(appId,objId), JSON.stringify(Array.from(set))); }catch(e){} }

  function ensureCell($row, pos, isHeader) {
    var $cell = $row.children('.rc-check-cell');
    if (!$cell.length) {
      // create correct element type
      if ($row.is('tr')) {
        $cell = $(isHeader ? '<th class="rc-check-cell" scope="col"></th>' : '<td class="rc-check-cell"></td>');
      } else {
        $cell = $(isHeader ? '<div class="rc-check-cell" role="columnheader" aria-label="Marked"></div>' : '<div class="rc-check-cell" role="cell"></div>');
      }
      if (pos === 'left') $cell.prependTo($row);
      else $cell.appendTo($row);
    } else {
      // move if needed
      if (pos === 'left' && $cell.index() !== 0) $cell.prependTo($row);
      if (pos === 'right' && $cell.index() !== $row.children().length - 1) $cell.appendTo($row);
    }
    // inner wrapper
    if ($cell.children('.rc-wrap').length === 0) { $cell.append('<div class="rc-wrap"></div>'); }
    var $wrap = $cell.children('.rc-wrap');
    // checkbox
    if ($wrap.children('input.rc-check').length === 0) {
      $wrap.append('<input class="rc-check'+(isHeader?' rc-check-all':'')+'" type="checkbox" aria-label="'+(isHeader?'Toggle all rows':'Mark row')+'">');
    }
    return $cell;
  }

  function refresh(self, $grid, set, appId, objId, pos) {
    if (!$grid || !$grid.length) return;
    if (self._painting) return;
    self._painting = true;
    try {
      // remove stale injected cells (from previous runs/versions) then rebuild
      $grid.find('.rc-check-cell').remove();

      var $hdr = headerRow($grid);
      if ($hdr && $hdr.length) {
        ensureCell($hdr, pos, true);
      }
      bodyRows($grid).each(function(){
        var $row = $(this);
        ensureCell($row, pos, false);
        var sig = $row.attr('data-rc-sig');
        if (!sig) { sig = computeSig($row); $row.attr('data-rc-sig', sig); }
        var on = !!(sig && set.has(sig));
        $row.toggleClass('rc-row-checked', on);
        $row.find('input.rc-check').prop('checked', on);
      });
    } finally {
      self._painting = false;
    }
  }

  function debounced(fn){ var t1,t2; return function(){ clearTimeout(t1); clearTimeout(t2); t1=setTimeout(fn,80); t2=setTimeout(fn,260); }; }

  return {
    initialProperties: { version: 3.0 },
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
              ref: "props.checkAlign", type: "string", component: "dropdown", label: "Checkbox Alignment",
              defaultValue: "center", options: [
                {value:"left",label:"Left"}, {value:"center",label:"Center"}, {value:"right",label:"Right"}
              ]
            },
            checkPosition: {
              ref: "props.checkPosition", type: "string", component: "dropdown", label: "Checkbox Column Position",
              defaultValue: "left", options: [{value:"left",label:"Left"}, {value:"right",label:"Right"}]
            },
            hideInAnalysis: { ref: "props.hideInAnalysis", type: "boolean", label: "Hide this helper in analysis mode", defaultValue: true }
          }
        }
      }
    },
    support: { snapshot:false, export:false, exportData:false },
    paint: function ($el, layout) {
      var mode = getMode();
      var p = layout.props || {};
      var targetId = (p.tableId || "").toString();
      var color = (p.checkColor || "#4caf50").trim(); if (color[0] !== "#") color = "#"+color;
      var align = (p.checkAlign || "center").toLowerCase();
      var pos = (p.checkPosition || "left").toLowerCase();
      var hide = (p.hideInAnalysis !== false);

      // helper visibility
      var $containers = $el.parents().addBack().filter('.qv-object, .qv-object-wrapper, .qv-visualization, .object');
      if (!$containers.length) $containers = $el;
      $containers.addClass('rc-helper');
      if (hide && mode !== 'edit') { $containers.addClass('rc-helper-hide').hide(); } else { $containers.removeClass('rc-helper-hide').show(); }

      var self = this;
      var $target = findTarget(targetId);
      if (!$target || !$target.length) {
        if (mode === "edit") $el.html('<div class="rc-hint">Row Checker: set a valid Target Table Object ID. Looking for: ' + (targetId || '(none)') + '</div>');
        else $el.empty();
        return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
      }

      var $grid = gridRoot($target);
      $target.addClass('rc-target');
      // CSS vars to control color & alignment; fixed width on cells keeps header aligned
      var justify = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');
      [$grid.get(0), $target.get(0)].forEach(function(el){ if (el && el.style) {
        el.style.setProperty('--rc-color', color);
        el.style.setProperty('--rc-justify', justify);
        el.style.setProperty('--rc-width', '28px');
      }});

      var app = qlik.currApp && qlik.currApp(this);
      var appId = (app && app.model && app.model.id) || (app && app.id) || "app";
      var set = loadSet(appId, targetId);

      var doRefresh = function(){ refresh(self, $grid, set, appId, targetId, pos); };
      var burst = debounced(doRefresh);
      doRefresh();

      // events (delegated)
      $grid.off('.rc');
      $grid.on('change.rc', 'input.rc-check', function(e){
        e.stopPropagation();
        var $cb = $(this);
        if ($cb.hasClass('rc-check-all')) {
          var on = $cb.is(':checked');
          bodyRows($grid).each(function(){
            var $row = $(this);
            var sig = $row.attr('data-rc-sig') || computeSig($row);
            $row.attr('data-rc-sig', sig);
            if (on) set.add(sig); else set.delete(sig);
            $row.toggleClass('rc-row-checked', on);
            $row.find('input.rc-check').prop('checked', on);
          });
          saveSet(appId, targetId, set);
          return;
        }
        var $row = $cb.closest('[role="row"], tr');
        var sig = $row.attr('data-rc-sig') || computeSig($row);
        $row.attr('data-rc-sig', sig);
        var on2 = $cb.is(':checked');
        if (on2) set.add(sig); else set.delete(sig);
        $row.toggleClass('rc-row-checked', on2);
        saveSet(appId, targetId, set);
      });

      // lightweight observer (guarded)
      if (self._obs) try{ self._obs.disconnect(); }catch(e){}
      var o = new MutationObserver(function(){ if (!self._painting) burst(); });
      try { o.observe($grid.get(0), { childList:true, subtree:true }); } catch(e){}
      self._obs = o;

      return (qlik.Promise && qlik.Promise.resolve) ? qlik.Promise.resolve() : Promise.resolve();
    }
  };
});
