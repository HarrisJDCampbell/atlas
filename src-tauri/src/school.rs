//! Course schedule from ~/Developer/automation/config/courses.conf.
//!
//! Format, one course per line:  CODE | Title | Days | Start | End | Room
//! The frontend does the clock math (what's now / next) so it ticks every second
//! without a round-trip.

use crate::config;
use crate::error::Result;
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub code: String,
    pub title: String,
    /// Mon..Sun as 1..7 (ISO weekday).
    pub days: Vec<u8>,
    /// Minutes after midnight.
    pub start: u32,
    pub end: u32,
    pub room: String,
    pub folder: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub semester: String,
    pub first_day: String,
    pub courses: Vec<Course>,
}

fn weekday(s: &str) -> Option<u8> {
    let prefix: String = s.trim().chars().take(3).collect::<String>().to_ascii_lowercase();
    Some(match prefix.as_str() {
        "mon" => 1,
        "tue" => 2,
        "wed" => 3,
        "thu" => 4,
        "fri" => 5,
        "sat" => 6,
        "sun" => 7,
        _ => return None,
    })
}

fn minutes(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    Some(h.parse::<u32>().ok()? * 60 + m.parse::<u32>().ok()?)
}

fn quoted(line: &str, key: &str) -> Option<String> {
    let rest = line.trim().strip_prefix(key)?.strip_prefix('=')?;
    Some(rest.trim().trim_matches('"').to_string())
}

pub fn parse(text: &str) -> (String, String, Vec<Course>) {
    let (mut semester, mut first_day, mut courses) = (String::new(), String::new(), Vec::new());
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if let Some(v) = quoted(t, "SEMESTER") {
            semester = v;
            continue;
        }
        if let Some(v) = quoted(t, "FIRST_DAY") {
            first_day = v;
            continue;
        }
        let f: Vec<&str> = t.split('|').map(str::trim).collect();
        if f.len() < 6 {
            continue;
        }
        let (Some(start), Some(end)) = (minutes(f[3]), minutes(f[4])) else { continue };
        courses.push(Course {
            code: f[0].to_string(),
            title: f[1].to_string(),
            days: f[2].split(',').filter_map(weekday).collect(),
            start,
            end,
            room: f[5].to_string(),
            folder: None,
        });
    }
    (semester, first_day, courses)
}

fn hm(m: u32) -> String {
    let (h, mm) = (m / 60, m % 60);
    format!("{}:{mm:02}{}", if h % 12 == 0 { 12 } else { h % 12 }, if h < 12 { "am" } else { "pm" })
}

/// Today's and tomorrow's classes, computed — small models get timetables wrong,
/// so they're handed the answer instead of the schedule.
pub fn today_block(now: chrono::DateTime<chrono::Local>) -> String {
    use chrono::{Datelike, Timelike};
    let Ok(s) = schedule() else { return String::new() };
    let wd = now.weekday().number_from_monday() as u8;
    let tomorrow = wd % 7 + 1;
    let mins = now.hour() * 60 + now.minute();
    let day = |d: u8| {
        let mut v: Vec<&Course> = s.courses.iter().filter(|c| c.days.contains(&d)).collect();
        v.sort_by_key(|c| c.start);
        v
    };
    let mut out = format!("## Today (computed — trust this over the raw schedule)\nIt is {}.\n", now.format("%A %B %-d, %-I:%M%P"));
    let today = day(wd);
    if today.is_empty() {
        out.push_str("No classes today.\n");
    } else {
        for c in &today {
            let state = if mins >= c.end { "done" } else if mins >= c.start { "happening now" } else { "upcoming" };
            out.push_str(&format!("- {} {} ({}–{}, {}): {state}\n", c.code, c.title, hm(c.start), hm(c.end), c.room));
        }
        if today.iter().all(|c| mins >= c.end) {
            out.push_str("All of today's classes are over.\n");
        }
    }
    let tom = day(tomorrow);
    out.push_str(&format!("Tomorrow ({}): {}\n",
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(tomorrow - 1) as usize],
        if tom.is_empty() { "no classes".to_string() } else { tom.iter().map(|c| format!("{} at {}", c.code, hm(c.start))).collect::<Vec<_>>().join(", ") }));
    out
}

#[tauri::command]
pub fn schedule() -> Result<Schedule> {
    let cfg = config::load()?;
    let text = std::fs::read_to_string(config::expand(&cfg.courses_file)).unwrap_or_default();
    let (semester, first_day, mut courses) = parse(&text);

    // Course folders are named "CODE - Title" under the semester root.
    let root = config::expand(&cfg.school_root);
    let dirs: Vec<String> = std::fs::read_dir(&root)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    for c in &mut courses {
        c.folder = dirs
            .iter()
            .find(|d| d.starts_with(&c.code))
            .map(|d| root.join(d).display().to_string());
    }
    Ok(Schedule { semester, first_day, courses })
}

/// Opens a course folder. Only paths that `schedule()` itself derived are allowed.
#[tauri::command]
pub fn open_course_folder(code: String) -> Result<()> {
    let s = schedule()?;
    let folder = s
        .courses
        .into_iter()
        .find(|c| c.code == code)
        .and_then(|c| c.folder)
        .ok_or_else(|| crate::error::Error::msg(format!("no folder for {code}")))?;
    std::process::Command::new("/usr/bin/open").arg(folder).status()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn today_block_live() {
        println!("{}", today_block(chrono::Local::now()));
    }

    #[test]
    fn parses_courses_conf() {
        let text = "# c\nSEMESTER=\"Fall 2026\"\nFIRST_DAY=\"2026-08-24\"\n\
                    MATH 101 | Calculus | Mon,Wed | 08:00 | 08:50 | Science 120\n\
                    CS 201   | Data Structures | Wed | 16:00 | 18:45 | Eng 204\n";
        let (sem, first, c) = parse(text);
        assert_eq!((sem.as_str(), first.as_str()), ("Fall 2026", "2026-08-24"));
        assert_eq!(c.len(), 2);
        assert_eq!(c[0].days, vec![1, 3]);
        assert_eq!((c[0].start, c[0].end), (480, 530));
        assert_eq!(c[1].code, "CS 201");
        assert_eq!(c[1].room, "Eng 204");
    }
}
