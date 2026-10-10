/* The galaxy's link to the VisCon backend.
 *
 * Everything on screen comes from here: /api/courses and /api/lectures build the
 * world, /api/lectures/:id supplies the playable media, and /api/ask is the lecture
 * Q&A — the same search the rest of VisCon uses. The shapes are flattened into the
 * short field names the scene code works in, so the renderer never has to know how
 * the API is spelled.
 */
window.GalaxyAPI = (function () {
  "use strict";

  async function getJSON(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      throw new Error((data && data.error) || "Die Verbindung zum Lernraum ist unterbrochen.");
    }
    return data;
  }

  function toNumberColour(css) {
    const hex = /^#([0-9a-f]{6})$/i.exec(String(css || ""));
    return hex ? parseInt(hex[1], 16) : 0x526cb7;
  }

  // Chapters are the LLM-built index; segments are the raw transcript windows.
  // Prefer chapters — they are what a reader recognises as a part of the lecture.
  function chaptersOf(lecture) {
    const list = (lecture.chapters && lecture.chapters.length) ? lecture.chapters : lecture.segments;
    return (list || []).map(function (s, i) {
      return { id: s.id || `${lecture.id}-${i}`, t: s.title, a: s.start, b: s.end, summary: s.summary || "" };
    });
  }

  async function load() {
    const [courseData, lectureData] = await Promise.all([
      getJSON("/api/courses"),
      getJSON("/api/lectures"),
    ]);
    const lectures = lectureData.lectures || [];

    const courses = (courseData.courses || [])
      .map(function (course) {
        const own = lectures
          .filter(function (l) { return l.courseId === course.id; })
          .sort(function (a, b) { return (a.episode || 0) - (b.episode || 0); })
          .map(function (l) {
            return {
              id: l.id,
              title: l.title,
              ep: l.episode,
              dur: l.duration,
              lecturer: l.lecturer || "",
              segs: chaptersOf(l),
            };
          });
        return {
          id: course.id,
          name: course.name,
          short: course.shortName || course.name,
          color: toNumberColour(course.color),
          css: course.color || "#526cb7",
          lecturer: own.length ? own[0].lecturer : "",
          // Where the course sits in the study programme ("other" while nobody has placed it)
          department: course.department || "other",
          degree: course.department ? course.degree : "unspecified",
          studyYear: course.department ? course.studyYear : 0,
          lectures: own,
        };
      })
      // A course with no recordings has nothing to land on
      .filter(function (course) { return course.lectures.length > 0; });

    if (!courses.length) throw new Error("Der Lernraum enthält noch keine Vorlesungen.");
    return { courses: courses, departments: courseData.departments || [] };
  }

  async function lectureDetail(id) {
    const data = await getJSON("/api/lectures/" + encodeURIComponent(id));
    return data.lecture;
  }

  async function ask(question, courseId) {
    const body = { question };
    if (courseId) body.courseId = courseId;
    return getJSON("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function postJSON(path, body) {
    return getJSON(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Where this student is (a lecture city and chapter, or nowhere), answered with the
  // live picture: who is where, and how hard each chapter has turned out to be
  function here(lectureId, chapterId) {
    return postJSON("/api/galaxy/here", { lectureId: lectureId || null, chapterId: chapterId || null });
  }

  function rate(lectureId, chapterId, rating) {
    return postJSON("/api/galaxy/difficulty", { lectureId, chapterId, rating });
  }

  return { load, lectureDetail, ask, here, rate };
})();
