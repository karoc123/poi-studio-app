// tests/harness/client.js
// Opaque-box Test API Client for Collaborative Trip & POI Planner
// Handles cookie session management, HTTP headers, and REST endpoint interactions.

class TestApiClient {
  constructor(baseUrl = 'http://127.0.0.1:3000') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.cookies = new Map();
  }

  /**
   * Clone client (e.g., to simulate multiple concurrent users like Alice, Bob, Charlie).
   */
  fork() {
    const forked = new TestApiClient(this.baseUrl);
    return forked;
  }

  _getCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  _extractCookies(res) {
    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);

    for (const header of setCookieHeaders) {
      if (!header) continue;
      const parts = header.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (value === '' || header.includes('Max-Age=0') || header.includes('expires=Thu, 01 Jan 1970')) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, value);
        }
      }
    }
  }

  /**
   * Raw low-level HTTP request.
   */
  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    const headers = new Headers(options.headers || {});

    const cookieHeader = this._getCookieHeader();
    if (cookieHeader && !headers.has('Cookie')) {
      headers.set('Cookie', cookieHeader);
    }

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      body = JSON.stringify(body);
    }

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: options.redirect || 'manual',
    });

    this._extractCookies(res);

    if (options.rawResponse) {
      return res;
    }

    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      data = await res.text();
    }

    return {
      status: res.status,
      headers: res.headers,
      data,
    };
  }

  // --- Auth Endpoints ---

  async login(username, password) {
    const body = { username };
    if (password !== undefined) body.password = password;
    return this.request('POST', '/api/auth/login', { body });
  }

  async logout() {
    return this.request('POST', '/api/auth/logout');
  }

  async getMe() {
    return this.request('GET', '/api/auth/me');
  }

  async updateProfile(profileData) {
    return this.request('PUT', '/api/auth/profile', { body: profileData });
  }

  // --- Trip Endpoints ---

  async getTrips() {
    return this.request('GET', '/api/trips');
  }

  async createTrip(tripData) {
    return this.request('POST', '/api/trips', { body: tripData });
  }

  async getTrip(tripId) {
    return this.request('GET', `/api/trips/${tripId}`);
  }

  async updateTrip(tripId, tripData) {
    return this.request('PUT', `/api/trips/${tripId}`, { body: tripData });
  }

  async deleteTrip(tripId) {
    return this.request('DELETE', `/api/trips/${tripId}`);
  }

  async duplicateTrip(tripId, body = {}) {
    return this.request('POST', `/api/trips/${tripId}/duplicate`, { body });
  }

  async regenerateInviteCode(tripId) {
    return this.request('POST', `/api/trips/${tripId}/invite-code`);
  }

  // --- Collaboration & Membership ---

  async joinTrip(inviteCode) {
    return this.request('POST', '/api/trips/join', { body: { inviteCode } });
  }

  async getMembers(tripId) {
    return this.request('GET', `/api/trips/${tripId}/members`);
  }

  async updateMemberRole(tripId, userId, role) {
    return this.request('PUT', `/api/trips/${tripId}/members/${userId}`, { body: { role } });
  }

  async removeMember(tripId, userId) {
    return this.request('DELETE', `/api/trips/${tripId}/members/${userId}`);
  }

  // --- POIs ---

  async createPoi(tripId, poiData) {
    return this.request('POST', `/api/trips/${tripId}/pois`, { body: poiData });
  }

  async updatePoi(tripId, poiId, poiData) {
    return this.request('PUT', `/api/trips/${tripId}/pois/${poiId}`, { body: poiData });
  }

  async deletePoi(tripId, poiId) {
    return this.request('DELETE', `/api/trips/${tripId}/pois/${poiId}`);
  }

  async reorderPois(tripId, items) {
    return this.request('POST', `/api/trips/${tripId}/pois/reorder`, { body: { items } });
  }

  async optimizeDay(tripId, day) {
    return this.request('POST', `/api/trips/${tripId}/pois/optimize-day`, { body: { day } });
  }

  // --- Social & Interaction ---

  async votePoi(tripId, poiId) {
    return this.request('POST', `/api/trips/${tripId}/pois/${poiId}/votes`);
  }

  async createComment(tripId, poiId, content) {
    return this.request('POST', `/api/trips/${tripId}/pois/${poiId}/comments`, { body: { content } });
  }

  async deleteComment(tripId, poiId, commentId) {
    return this.request('DELETE', `/api/trips/${tripId}/pois/${poiId}/comments/${commentId}`);
  }

  // --- Checklists ---

  async createChecklist(tripId, checklistData) {
    return this.request('POST', `/api/trips/${tripId}/checklists`, { body: checklistData });
  }

  async updateChecklist(tripId, itemId, data) {
    return this.request('PUT', `/api/trips/${tripId}/checklists/${itemId}`, { body: data });
  }

  async deleteChecklist(tripId, itemId) {
    return this.request('DELETE', `/api/trips/${tripId}/checklists/${itemId}`);
  }

  // --- Geospatial Proxies ---

  async geoSearch(q, limit = 6) {
    return this.request('GET', `/api/geo/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  async geoReverse(lat, lon) {
    return this.request('GET', `/api/geo/reverse?lat=${lat}&lon=${lon}`);
  }

  async geoRoute(mode, coords) {
    return this.request('GET', `/api/geo/route?mode=${mode}&coords=${coords}`);
  }

  // --- Export & Portability ---

  async exportJson(tripId) {
    return this.request('GET', `/api/trips/${tripId}/export/json`);
  }

  async importJson(exportPayload) {
    return this.request('POST', '/api/trips/import/json', { body: exportPayload });
  }

  async exportGpx(tripId) {
    return this.request('GET', `/api/trips/${tripId}/export/gpx`);
  }

  async exportGeoJson(tripId) {
    return this.request('GET', `/api/trips/${tripId}/export/geojson`);
  }

  async exportIcs(tripId) {
    return this.request('GET', `/api/trips/${tripId}/export/ics`);
  }

  async getPrintBooklet(tripId) {
    return this.request('GET', `/trips/${tripId}/print`);
  }
}

module.exports = {
  TestApiClient,
};
