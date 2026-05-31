/**
 * Danh mục phường/xã Đà Nẵng — /api/wards/
 */
(function (global) {
  let wardsCache = null;

  async function fetchWards(apiFetch) {
    if (wardsCache) return wardsCache;
    const res = await apiFetch('/api/wards/');
    if (!res.ok) throw new Error('Không tải được danh sách phường/xã');
    const data = await res.json();
    wardsCache = Array.isArray(data) ? data : (data.results || []);
    return wardsCache;
  }

  function groupByDistrict(wards) {
    const groups = {};
    wards.forEach((w) => {
      if (!groups[w.district]) groups[w.district] = [];
      groups[w.district].push(w);
    });
    return groups;
  }

  function populateWardSelect(selectEl, wards, { selectedId, placeholder, districtFilter } = {}) {
    if (!selectEl) return;
    const prev = selectedId || selectEl.value;
    selectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder || '-- Chọn phường/xã --';
    selectEl.appendChild(ph);

    let list = wards;
    if (districtFilter) {
      list = wards.filter((w) => w.district === districtFilter);
    }
    const groups = groupByDistrict(list);
    Object.keys(groups).sort().forEach((district) => {
      const og = document.createElement('optgroup');
      og.label = district;
      groups[district].forEach((w) => {
        const opt = document.createElement('option');
        opt.value = String(w.id);
        opt.textContent = w.name;
        opt.dataset.lat = w.latitude;
        opt.dataset.lng = w.longitude;
        opt.dataset.district = w.district;
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
    if (prev) selectEl.value = String(prev);
  }

  function populateDistrictFilter(selectEl, wards) {
    if (!selectEl) return;
    const districts = [...new Set(wards.map((w) => w.district))].sort();
    selectEl.innerHTML = '<option value="">Tất cả quận/huyện</option>';
    districts.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      selectEl.appendChild(opt);
    });
  }

  function wardLabel(w) {
    if (!w) return '—';
    return w.full_label || `${w.name}, ${w.district}`;
  }

  /** Lấy ward id từ sự cố / thiết bị (ưu tiên FK ward, rồi thiết bị liên kết). */
  function resolveWardId(entity) {
    if (!entity || typeof entity !== 'object') return null;
    if (entity.ward != null && entity.ward !== '') return Number(entity.ward);
    if (entity.ward_detail?.id != null) return Number(entity.ward_detail.id);
    if (entity.device_detail?.ward != null) return Number(entity.device_detail.ward);
    if (entity.from_device_detail?.ward != null) return Number(entity.from_device_detail.ward);
    return null;
  }

  async function fetchAssignableTechnicians(apiFetch, usersApiBase, wardId = null) {
    const base = usersApiBase.endsWith('/') ? usersApiBase : `${usersApiBase}/`;
    const params = new URLSearchParams();
    if (wardId != null && wardId !== '') params.set('ward', String(wardId));
    const qs = params.toString();
    const url = qs ? `${base}assignable-technicians/?${qs}` : `${base}assignable-technicians/`;
    const res = await apiFetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { techs: [], error: err.detail || `Không tải được KTV (HTTP ${res.status}).` };
    }
    const data = await res.json();
    const techs = Array.isArray(data) ? data : (data.results ?? []);
    return { techs, error: null };
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function maxKmForDistrict(district) {
    return district === 'Hòa Vang' ? 12 : 4.5;
  }

  function getNearestWard(wards, lat, lng) {
    let nearest = null;
    let distanceKm = Infinity;
    (wards || []).forEach((w) => {
      const d = haversineKm(lat, lng, w.latitude, w.longitude);
      if (d < distanceKm) {
        distanceKm = d;
        nearest = w;
      }
    });
    return { ward: nearest, distanceKm };
  }

  /** Kiểm tra tọa độ có khớp phường/xã đã chọn (cùng logic backend). */
  function validateCoordsForWard(wards, wardId, lat, lng) {
    if (!wardId) {
      return {
        ok: false,
        message: 'Vui lòng chọn phường/xã trước khi chọn tọa độ trên bản đồ.',
      };
    }
    const selected = (wards || []).find((w) => String(w.id) === String(wardId));
    if (!selected) {
      return { ok: false, message: 'Phường/xã không hợp lệ.' };
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return { ok: false, message: 'Tọa độ không hợp lệ.' };
    }

    const { ward: nearest } = getNearestWard(wards, lat, lng);
    const distSelected = haversineKm(lat, lng, selected.latitude, selected.longitude);
    const maxKm = maxKmForDistrict(selected.district);

    if (!nearest || String(nearest.id) !== String(selected.id) || distSelected > maxKm) {
      let message = `Tọa độ không thuộc "${selected.name}".`;
      if (nearest && String(nearest.id) !== String(selected.id)) {
        message += ` Vị trí gần nhất: ${nearest.name}.`;
      } else {
        message += ' Hãy click trong phạm vi phường/xã đã chọn.';
      }
      return { ok: false, message, selected, nearest };
    }
    return { ok: true, selected, nearest };
  }

  global.WardUtils = {
    fetchWards,
    fetchAssignableTechnicians,
    populateWardSelect,
    populateDistrictFilter,
    wardLabel,
    resolveWardId,
    haversineKm,
    maxKmForDistrict,
    getNearestWard,
    validateCoordsForWard,
    clearCache: () => { wardsCache = null; },
  };
})(window);
