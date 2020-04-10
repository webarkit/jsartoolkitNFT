function createStats(create) {
if(create) {
  var stats = document.createElement('div');
  stats.id = "stats";
  stats.className = "ui stats";
  var stats1 = document.createElement('div');
  stats1.id = "stats1";
  stats1.className = "stats-item";
  var stats1p = document.createElement('p');
  stats1p.className = "stats-item-title";
  stats1p.innerText = "Main";
  stats1.appendChild(stats1p);
  stats.appendChild(stats1);
  var stats2 = document.createElement('div');
  stats2.id = "stats2";
  stats2.className = "stats-item";
  var stats2p = document.createElement('p');
  stats2p.className = "stats-item-title";
  stats2p.innerText = "Worker";
  stats2.appendChild(stats2p);
  stats.appendChild(stats2);
  var loading = document.getElementById('loading');
  document.body.insertBefore(stats, loading);
}
}
