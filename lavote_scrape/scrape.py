from typer import Typer, Argument, Option
import typing as t
import requests
import subprocess
import time
from glob import glob
from dateutil.parser import parse
import json
from pathlib import Path
from datetime import datetime


app = Typer()

FILE_NAME = "{eid}_{date}.json"
moo_mp3 = Path(__file__).parent.parent / "moo.mp3"
assert moo_mp3.exists()


def play_moo():
    """Play the moo sound, ignoring any audio/libvlc failures (e.g. on CI)."""
    try:
        import vlc

        vlc.MediaPlayer(str(moo_mp3)).play()
    except Exception as e:
        print(f"Could not play moo: {e}")


def update_index(
    eid: int,
    title: str = None,
    election_date: str = None,
    meta_file: str = None,
    result_file: str = None,
):
    path = Path("index.json")
    index = json.loads(path.read_text()) if path.exists() else {}
    key = str(eid)
    entry = index.setdefault(
        key, {"title": "", "election_date": "", "meta_file": "", "result_files": []}
    )
    if title is not None:
        entry["title"] = title
    if election_date is not None:
        entry["election_date"] = election_date
    if meta_file is not None:
        entry["meta_file"] = meta_file
    if result_file and result_file not in entry["result_files"]:
        entry["result_files"].append(result_file)
    path.write_text(json.dumps(index, indent=2) + "\n")


def backfill_index(eid: int):
    path = Path("index.json")
    index = json.loads(path.read_text()) if path.exists() else {}
    if str(eid) in index:
        return
    meta_file = f"election_{eid}.json"
    if not Path(meta_file).exists():
        return
    meta = json.loads(Path(meta_file).read_text())
    data = meta["Data"]
    update_index(
        eid,
        title=data["Title"],
        election_date=data["Date"][:10],
        meta_file=meta_file,
    )
    for f in sorted(glob(f"{eid}_*.json")):
        update_index(eid, result_file=f)


NTFY_TOPIC = "lavote-results"
VIEWER_URL = "https://bckohan.github.io/lavote_scrape/"


def notify(filename: str):
    """Send a push notification via ntfy.sh. Never raises."""
    try:
        requests.post(
            f"https://ntfy.sh/{NTFY_TOPIC}",
            data=filename.encode(),
            headers={
                "Title": "LA Vote: new results",
                "Click": VIEWER_URL,
                "Tags": "ballot_box",
            },
            timeout=10,
        )
    except Exception as e:
        print(f"ntfy notification failed (non-fatal): {e}")


def git_commit(filename: str):
    """Stage, commit and push a results file together with the updated index."""
    try:
        subprocess.run(["git", "add", filename, "index.json"], check=True)
        subprocess.run(
            ["git", "commit", "-m", f"Add results {filename}"], check=True
        )
        subprocess.run(["git", "push"], check=True)
        print(f"Committed {filename}")
        notify(filename)
    except subprocess.CalledProcessError as e:
        print(f"git commit/push failed: {e}")


@app.command()
def scrape(
    eid: t.Annotated[int, Argument(help="Election ID")],
    delay: t.Annotated[int, Option(help="Delay in seconds")] = 60,
    moo: t.Annotated[
        bool, Option(help="Play a moo sound when new results arrive")
    ] = True,
    commit: t.Annotated[
        bool, Option(help="git commit & push each new results file")
    ] = False,
    max_runtime: t.Annotated[
        int,
        Option(
            help="Exit cleanly after this many seconds (0 = run forever)"
        ),
    ] = 0,
):
    started = time.monotonic()
    last_timestamp = None
    for f in glob(f"{eid}_*.json"):
        try:
            with open(f) as fh:
                ts = parse(json.load(fh)["TimeStamp"])
                if last_timestamp is None or ts > last_timestamp:
                    last_timestamp = ts
        except Exception:
            pass

    for meta in glob("election_*.json"):
        try:
            existing_eid = int(meta.removeprefix("election_").removesuffix(".json"))
            backfill_index(existing_eid)
        except ValueError:
            pass

    election_file = f"election_{eid}.json"
    if not Path(election_file).exists():
        election = requests.get(
            f"https://results.lavote.gov/ElectionResults/GetElectionData?electionID={eid}"
        ).json()
        with open(election_file, "w") as f:
            json.dump(election, f)
        update_index(
            eid,
            title=election["Data"]["Title"],
            election_date=election["Data"]["Date"][:10],
            meta_file=election_file,
        )
        print(f"Saved election metadata {election_file}")
        if commit:
            git_commit(election_file)

    while True:
        results = requests.get(
            f"https://results.lavote.gov/ElectionResults/GetCounterData?electionID={eid}"
        ).json()
        timestamp = parse(results["TimeStamp"])

        if not last_timestamp or timestamp > last_timestamp:
            filename = FILE_NAME.format(eid=eid, date=str(datetime.now()))
            with open(filename, "w") as f:
                json.dump(results, f)
            update_index(eid, result_file=filename)
            last_timestamp = timestamp  # track API timestamp, not wall clock
            if moo:
                play_moo()
            print(f"New Results {filename}")
            if commit:
                git_commit(filename)

        if max_runtime and time.monotonic() - started >= max_runtime:
            print(f"Reached max runtime of {max_runtime}s, exiting.")
            break

        print("Sleeping...")
        time.sleep(delay)


def main():
    app()

if __name__ == "__main__":
    main()
