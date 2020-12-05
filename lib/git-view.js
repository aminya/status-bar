/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from "underscore-plus";
import { CompositeDisposable, Directory } from "atom";

export default class GitView {
  constructor() {
    this.element = document.createElement("status-bar-git");
    this.element.classList.add("git-view");

    this.createBranchArea();
    this.createCommitsArea();
    this.createStatusArea();

    this.activeEditorSubscription = atom.workspace.observeActiveTextEditor(
      (editor) => {
        this.subscribeToEditor(editor);
      }
    );
  }

  createBranchArea() {
    this.branchArea = document.createElement("div");
    this.branchArea.classList.add("git-branch", "inline-block");
    this.element.appendChild(this.branchArea);
    this.element.branchArea = this.branchArea;

    const branchIcon = document.createElement("span");
    branchIcon.classList.add("icon", "icon-git-branch");
    this.branchArea.appendChild(branchIcon);

    this.branchLabel = document.createElement("span");
    this.branchLabel.classList.add("branch-label");
    this.branchArea.appendChild(this.branchLabel);
    this.element.branchLabel = this.branchLabel;
  }

  createCommitsArea() {
    this.commitsArea = document.createElement("div");
    this.commitsArea.classList.add("git-commits", "inline-block");
    this.element.appendChild(this.commitsArea);

    this.commitsAhead = document.createElement("span");
    this.commitsAhead.classList.add(
      "icon",
      "icon-arrow-up",
      "commits-ahead-label"
    );
    this.commitsArea.appendChild(this.commitsAhead);

    this.commitsBehind = document.createElement("span");
    this.commitsBehind.classList.add(
      "icon",
      "icon-arrow-down",
      "commits-behind-label"
    );
    this.commitsArea.appendChild(this.commitsBehind);
  }

  createStatusArea() {
    this.gitStatus = document.createElement("div");
    this.gitStatus.classList.add("git-status", "inline-block");
    this.element.appendChild(this.gitStatus);

    this.gitStatusIcon = document.createElement("span");
    this.gitStatusIcon.classList.add("icon");
    this.gitStatus.appendChild(this.gitStatusIcon);
    this.element.gitStatusIcon = this.gitStatusIcon;
  }

  async subscribeToEditor(editor) {
    this.activeEditorSubscriptions?.dispose();
    this.activeEditorSubscriptions = new CompositeDisposable();

    this.activeEditor = editor;
    if (this.activeEditor) {
      this.activeRepo = await atom.project.repositoryForDirectory(
        new Directory(this.activeEditor.getPath())
      );
      if (this.activeRepo) {
        this.activeEditorSubscriptions.add(
          this.activeEditor.onDidSave(() => this.update()),
          this.activeRepo.onDidChangeStatus(({ path }) => {
            if (this.activeEditor.getPath() === path) {
              this.update();
            }
          }),
          this.activeRepo.onDidChangeStatuses(() => {
            this.update();
          })
        );
      }
    }
    this.update();
  }

  destroy() {
    this.activeEditorSubscription?.dispose();
    this.activeEditorSubscriptions?.dispose();
    this.branchTooltipDisposable?.dispose();
    this.commitsAheadTooltipDisposable?.dispose();
    this.commitsBehindTooltipDisposable?.dispose();
    this.statusTooltipDisposable?.dispose();
  }

  update() {
    this.updateBranchText();
    this.updateAheadBehindCount();
    this.updateStatusText();
  }

  updateBranchText() {
    if (this.activeRepo) {
      const head = this.activeRepo.getShortHead(this.activeEditor?.getPath());
      this.branchLabel.textContent = head;
      if (head) {
        this.branchArea.style.display = "";
      }
      this.branchTooltipDisposable?.dispose();
      this.branchTooltipDisposable = atom.tooltips.add(this.branchArea, {
        title: `On branch ${head}`,
      });
    } else {
      this.branchArea.style.display = "none";
    }
  }

  updateAheadBehindCount() {
    if (!this.activeRepo) {
      this.commitsArea.style.display = "none";
      return;
    }

    const itemPath = this.activeEditor?.getPath();
    const { ahead, behind } = this.activeRepo.getCachedUpstreamAheadBehindCount(
      itemPath
    );
    if (ahead > 0) {
      this.commitsAhead.textContent = ahead;
      this.commitsAhead.style.display = "";
      this.commitsAheadTooltipDisposable?.dispose();
      this.commitsAheadTooltipDisposable = atom.tooltips.add(
        this.commitsAhead,
        { title: `${_.pluralize(ahead, "commit")} ahead of upstream` }
      );
    } else {
      this.commitsAhead.style.display = "none";
    }

    if (behind > 0) {
      this.commitsBehind.textContent = behind;
      this.commitsBehind.style.display = "";
      this.commitsBehindTooltipDisposable?.dispose();
      this.commitsBehindTooltipDisposable = atom.tooltips.add(
        this.commitsBehind,
        { title: `${_.pluralize(behind, "commit")} behind upstream` }
      );
    } else {
      this.commitsBehind.style.display = "none";
    }

    if (ahead > 0 || behind > 0) {
      this.commitsArea.style.display = "";
    } else {
      this.commitsArea.style.display = "none";
    }
  }

  clearStatus() {
    this.gitStatusIcon.classList.remove(
      "icon-diff-modified",
      "status-modified",
      "icon-diff-added",
      "status-added",
      "icon-diff-ignored",
      "status-ignored"
    );
  }

  updateAsNewFile() {
    this.clearStatus();

    this.gitStatusIcon.classList.add("icon-diff-added", "status-added");
    const textEditor = atom.workspace.getActiveTextEditor();
    if (textEditor) {
      this.gitStatusIcon.textContent = `+${textEditor.getLineCount()}`;
      this.updateTooltipText(
        `${_.pluralize(
          textEditor.getLineCount(),
          "line"
        )} in this new file not yet committed`
      );
    } else {
      this.gitStatusIcon.textContent = "";
      this.updateTooltipText();
    }

    this.gitStatus.style.display = "";
  }

  updateAsModifiedFile(path) {
    const stats = this.activeRepo.getDiffStats(path);
    this.clearStatus();

    this.gitStatusIcon.classList.add("icon-diff-modified", "status-modified");
    if (stats.added && stats.deleted) {
      this.gitStatusIcon.textContent = `+${stats.added}, -${stats.deleted}`;
      this.updateTooltipText(
        `${_.pluralize(stats.added, "line")} added and ${_.pluralize(
          stats.deleted,
          "line"
        )} deleted in this file not yet committed`
      );
    } else if (stats.added) {
      this.gitStatusIcon.textContent = `+${stats.added}`;
      this.updateTooltipText(
        `${_.pluralize(
          stats.added,
          "line"
        )} added to this file not yet committed`
      );
    } else if (stats.deleted) {
      this.gitStatusIcon.textContent = `-${stats.deleted}`;
      this.updateTooltipText(
        `${_.pluralize(
          stats.deleted,
          "line"
        )} deleted from this file not yet committed`
      );
    } else {
      this.gitStatusIcon.textContent = "";
      this.updateTooltipText();
    }

    this.gitStatus.style.display = "";
  }

  updateAsIgnoredFile() {
    this.clearStatus();

    this.gitStatusIcon.classList.add("icon-diff-ignored", "status-ignored");
    this.gitStatusIcon.textContent = "";
    this.gitStatus.style.display = "";
    this.updateTooltipText("File is ignored by git");
  }

  updateTooltipText(text) {
    this.statusTooltipDisposable?.dispose();
    if (text) {
      this.statusTooltipDisposable = atom.tooltips.add(this.gitStatusIcon, {
        title: text,
      });
    }
  }

  updateStatusText() {
    const hideStatus = () => {
      this.clearStatus();
      this.gitStatus.style.display = "none";
    };

    const itemPath = this.activeEditor?.getPath();
    if (this.activeRepo && itemPath) {
      let repoCachedPathStatus = this.activeRepo.getCachedPathStatus(itemPath);
      const status = repoCachedPathStatus ? repoCachedPathStatus : 0;

      if (this.activeRepo.isStatusNew(status)) {
        this.updateAsNewFile();
        return;
      }

      if (this.activeRepo.isStatusModified(status)) {
        this.updateAsModifiedFile(itemPath);
        return;
      }

      if (this.activeRepo.isPathIgnored(itemPath)) {
        this.updateAsIgnoredFile();
        return;
      } else {
        hideStatus();
        return;
      }
    } else {
      hideStatus();
      return;
    }
  }
}
