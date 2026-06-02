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


def git_commit(filename: str):
    """Stage, commit and push a single results file."""
    try:
        subprocess.run(["git", "add", filename], check=True)
        subprocess.run(
            ["git", "commit", "-m", f"Add results {filename}"], check=True
        )
        subprocess.run(["git", "push"], check=True)
        print(f"Committed {filename}")
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
):
    last_timestamp = None
    result_files = glob(f"{eid}_*.json")
    if result_files:
        last_file = sorted(result_files)[-1]
        last_timestamp = parse(last_file.split("_")[1].split(".")[0])

    while True:
        results = requests.get(
            f"https://results.lavote.gov/ElectionResults/GetCounterData?electionID={eid}"
        ).json()
        timestamp = parse(results["TimeStamp"])

        if not last_timestamp or timestamp > last_timestamp:
            timestamp = datetime.now()
            filename = FILE_NAME.format(eid=eid, date=str(timestamp))
            with open(filename, "w") as f:
                json.dump(results, f)
            last_timestamp = timestamp
            if moo:
                play_moo()
            print(f"New Results {filename}")
            if commit:
                git_commit(filename)

        print("Sleeping...")
        time.sleep(delay)


def main():
    app()

if __name__ == "__main__":
    main()
