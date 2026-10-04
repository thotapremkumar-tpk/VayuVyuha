"""Aircraft readiness (pre-flight no-go) predictor trained on SYNTHETIC maintenance telemetry."""
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, roc_curve

FEATS = ["hrs_since_service", "sorties_72h", "age_years", "vib_anomaly", "fault_count_30d"]

def synth(n, rng):
    X = np.column_stack([rng.uniform(0, 160, n), rng.integers(0, 10, n), rng.uniform(1, 25, n),
                         rng.beta(1.5, 6, n), rng.integers(0, 6, n)])
    z = (0.022 * X[:, 0] + 0.16 * X[:, 1] + 0.03 * X[:, 2] + 4.0 * X[:, 3] + 0.30 * X[:, 4]
         + 0.0012 * X[:, 0] * X[:, 1] - 8.6 + rng.normal(0, 0.7, n))
    y = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    return X, y

def train(seed=0):
    rng = np.random.default_rng(seed)
    X, y = synth(8000, rng)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=seed, stratify=y)
    clf = GradientBoostingClassifier(n_estimators=160, max_depth=3, learning_rate=0.08, random_state=seed)
    clf.fit(Xtr, ytr)
    p = clf.predict_proba(Xte)[:, 1]
    fpr, tpr, _ = roc_curve(yte, p)
    info = {"auc": round(float(roc_auc_score(yte, p)), 3), "n_train": int(len(ytr)), "n_test": int(len(yte)),
            "base_rate": round(float(y.mean()), 3),
            "importance": {f: round(float(i), 3) for f, i in zip(FEATS, clf.feature_importances_)},
            "roc": {"fpr": fpr[::8].round(3).tolist(), "tpr": tpr[::8].round(3).tolist()}}
    return clf, info

def make_p_nogo(clf):
    def f(a):
        x = np.array([[a["hrs_since_service"], a["sorties_72h"], a["age_years"], a["vib_anomaly"], a["fault_count_30d"]]])
        return float(clf.predict_proba(x)[0, 1])
    return f
