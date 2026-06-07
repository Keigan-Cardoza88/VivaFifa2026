import json
import re
import os

transcript_path = r"C:\Users\Keigan Merv Cardoza\.gemini\antigravity-ide\brain\b3af2d1a-349c-47ab-a7c9-9723e48f7c3b\.system_generated\logs\transcript.jsonl"
output_path = r"c:\Program Files\Python Programs\VivaFifa2026\mobile\src\data\teamsData.js"

# Predefined list of 48 countries to identify team lines
countries = {
    "Mexico", "South Africa", "South Korea", "Czechia", "Canada",
    "Bosnia & Herzegovina", "Bosnia and Herzegovina", "Qatar", "Switzerland",
    "Brazil", "Morocco", "Haiti", "Scotland", "United States", "USA",
    "Paraguay", "Australia", "Türkiye", "Turkey", "Germany", "Curaçao",
    "Curacao", "Ivory Coast", "Ecuador", "Netherlands", "Japan", "Tunisia",
    "Sweden", "Belgium", "Egypt", "Iran", "New Zealand", "Spain", "Cape Verde",
    "Cabo Verde", "Saudi Arabia", "Uruguay", "France", "Senegal", "Iraq",
    "Norway", "Argentina", "Algeria", "Austria", "Jordan", "Portugal",
    "DR Congo", "Uzbekistan", "Colombia", "England", "Croatia", "Ghana", "Panama"
}

# Normalize country name variations
def normalize_country(name):
    name = name.strip()
    if name == "USA":
        return "United States"
    if name == "Turkey":
        return "Türkiye"
    if name == "Curacao":
        return "Curaçao"
    if name == "Cabo Verde":
        return "Cape Verde"
    if name == "Bosnia & Herzegovina":
        return "Bosnia and Herzegovina"
    return name

full_text = ""
if os.path.exists(transcript_path):
    print("Found transcript file. Reading...")
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                obj = json.loads(line)
                content = obj.get("content", "")
                # Match any transcript line containing GROUP A-L lists
                if "GROUP" in content and ("GK" in content or "Goalkeepers" in content):
                    full_text += content + "\n"
            except Exception as e:
                pass
else:
    print("Transcript not found at path:", transcript_path)

if not full_text:
    print("No matching content found in transcript!")
    exit(1)

print("Parsing groups and teams line-by-line...")
lines = full_text.split("\n")

# Use nested dictionaries for deduplication: { team: { player_name: { pos, peak, current } } }
raw_teams = {}
current_group = None
current_team = None

player_regex = re.compile(r"^\s*([^\(]+)\s*\(([A-Z]+)\)\s*.*\[\s*(\d+)\s*/\s*(\d+)\s*\]")

for line in lines:
    line = line.strip()
    if not line:
        continue
    
    # Check for group headings, e.g. 🏆 GROUP A
    group_match = re.match(r".*GROUP\s+([A-L])", line, re.IGNORECASE)
    if group_match:
        current_group = group_match.group(1).upper()
        continue
        
    # Check if this line is a team header line
    # Strip emojis/flag indicators and trailing/leading space to check country match
    clean_line = re.sub(r"[^\w\s&'-]", "", line).strip()
    
    matched_country = None
    for country in countries:
        if clean_line.lower().endswith(country.lower()) or clean_line.lower() == country.lower():
            matched_country = normalize_country(country)
            break
            
    if matched_country:
        current_team = matched_country
        if current_team not in raw_teams:
            raw_teams[current_team] = {
                "group": current_group or "A",
                "players": {}
            }
        continue
        
    # If we have a current team, try matching a player line
    if current_team:
        p_match = player_regex.match(line)
        if p_match:
            name = p_match.group(1).strip()
            pos = p_match.group(2).strip()
            peak = int(p_match.group(3))
            curr = int(p_match.group(4))
            
            # Store/overwrite in dictionary to deduplicate by player name
            raw_teams[current_team]["players"][name] = {
                "pos": pos,
                "peak": peak,
                "current": curr
            }

# Convert raw_teams to final list structure
teams_dict = {}
for team_name, info in raw_teams.items():
    players_list = []
    # Sort players by position (GK, DF, MF, FW) for nice display order
    pos_order = {"GK": 0, "DF": 1, "MF": 2, "FW": 3}
    sorted_players = sorted(
        info["players"].items(),
        key=lambda item: (pos_order.get(item[1]["pos"], 9), item[0])
    )
    for name, p_info in sorted_players:
        players_list.append({
            "name": name,
            "pos": p_info["pos"],
            "peak": p_info["peak"],
            "current": p_info["current"]
        })
        
    teams_dict[team_name] = {
        "group": info["group"],
        "players": players_list
    }

print(f"Parsed {len(teams_dict)} teams successfully.")
for team_name, info in sorted(teams_dict.items()):
    print(f"Team: {team_name} ({info['group']}), Players: {len(info['players'])}")

# Write to file
js_content = f"// Static database of all 48 teams, squads, and ratings\n"
js_content += f"export const teamsData = {json.dumps(teams_dict, indent=2, ensure_ascii=False)};\n"

os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    f.write(js_content)

print("Saved output to", output_path)


