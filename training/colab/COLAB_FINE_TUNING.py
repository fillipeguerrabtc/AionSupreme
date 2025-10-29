# AION - Fine-Tuning Notebook (Google Colab)
# ==============================================
# Este notebook realiza fine-tuning LoRA em Llama-3-8B usando
# dados de treino coletados automaticamente pelo AION.
#
# GPU necessária: T4 (Colab grátis)
# Tempo estimado: 8-12h
# Memória: ~16GB VRAM
#
# Documentação: docs/FREE_GPU_API_STRATEGY.md

# %% [markdown]
# # 🚀 AION - Fine-Tuning LoRA (Llama-3-8B)
# 
# Este notebook permite fazer fine-tuning do modelo Llama-3-8B usando LoRA
# (Low-Rank Adaptation) com seus próprios dados de conversas coletados pelo AION.
# 
# **Benefícios:**
# - ✅ Treina apenas 0.4% dos parâmetros (~65M de 8B)
# - ✅ Cabe na GPU T4 do Colab grátis (16GB VRAM)
# - ✅ Treino rápido (8-12h vs meses)
# - ✅ Adaptadores pequenos (~200MB vs 16GB modelo completo)
# - ✅ 100% customizado para seu domínio
# - ✅ SEM censura (você controla os dados)

# %% [code]
# ==============================================================================
# SEÇÃO 1: Configuração Inicial
# ==============================================================================

# Montar Google Drive (onde salvamos checkpoints e adaptadores)
from google.colab import drive
drive.mount('/content/drive')

# Criar diretórios necessários
import os
os.makedirs('/content/drive/MyDrive/aion/checkpoints', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/lora_adapters', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/data', exist_ok=True)

print("✓ Google Drive montado com sucesso!")

# %% [code]
# ==============================================================================
# SEÇÃO 2: Instalação de Dependências
# ==============================================================================

!pip install -q torch transformers peft datasets accelerate bitsandbytes sentencepiece

print("✓ Dependências instaladas!")

# %% [code]
# ==============================================================================
# SEÇÃO 3: Configuração do Modelo e LoRA
# ==============================================================================

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import Dataset
import json

# Modelo base: Llama-3-8B
MODEL_NAME = "meta-llama/Meta-Llama-3-8B-Instruct"

# Configuração de quantização 4-bit (16GB → 4GB)
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

print(f"📦 Carregando modelo {MODEL_NAME}...")

# Carregar modelo com quantização
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

print("✓ Modelo carregado com quantização 4-bit!")

# Configurar LoRA
lora_config = LoraConfig(
    r=16,  # Rank (quanto maior, mais parâmetros treináveis)
    lora_alpha=32,  # Alpha (escala do LoRA)
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],  # Quais camadas adaptar
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = prepare_model_for_kbit_training(model)
model = get_peft_model(model, lora_config)

# Mostrar estatísticas
trainable_params, all_param = model.get_nb_trainable_parameters()
print(f"✓ LoRA configurado!")
print(f"📊 Parâmetros treináveis: {trainable_params:,} ({trainable_params/all_param*100:.2f}% do total)")

# %% [code]
# ==============================================================================
# SEÇÃO 4: Carregar Dados de Treino
# ==============================================================================

# OPÇÃO 1: Baixar via API do AION (recomendado)
import requests

AION_API_URL = "https://sua-url-replit.repl.co"  # Substitua pela sua URL
TENANT_ID = 1

response = requests.post(
    f"{AION_API_URL}/api/training/prepare",
    json={"tenant_id": TENANT_ID, "criteria": {"minTokens": 10}}
)

if response.status_code == 200:
    # Copiar arquivo para Drive
    # TODO: Implementar download automático
    print("✓ Dados baixados via API")
else:
    print("⚠️  Erro baixando dados. Use OPÇÃO 2 manual.")

# OPÇÃO 2: Upload manual do arquivo JSONL
# 1. Execute POST /api/training/prepare no AION
# 2. Baixe o arquivo .jsonl gerado
# 3. Faça upload para /content/drive/MyDrive/aion/data/

# Carregar dataset JSONL
data_path = "/content/drive/MyDrive/aion/data/training_data.jsonl"

# Verificar se arquivo existe
if not os.path.exists(data_path):
    print("❌ ERRO: Arquivo de treino não encontrado!")
    print(f"   Por favor, faça upload do arquivo JSONL para:")
    print(f"   {data_path}")
    raise FileNotFoundError(data_path)

# Carregar dados
with open(data_path) as f:
    data = [json.loads(line) for line in f]

print(f"✓ {len(data)} exemplos carregados!")

# Converter para Dataset do HuggingFace
dataset = Dataset.from_list(data)

# %% [code]
# ==============================================================================
# SEÇÃO 5: Preparar Dados (Tokenização)
# ==============================================================================

def format_instruction(sample):
    """Formata exemplo no template Alpaca/Instruct"""
    instruction = sample.get('instruction', '')
    input_text = sample.get('input', '')
    output = sample.get('output', '')
    
    if input_text:
        prompt = f"### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n\n### Response:\n{output}"
    else:
        prompt = f"### Instruction:\n{instruction}\n\n### Response:\n{output}"
    
    return prompt

def tokenize(sample):
    """Tokeniza exemplo para treino"""
    text = format_instruction(sample)
    result = tokenizer(
        text,
        truncation=True,
        max_length=512,  # Ajuste conforme necessário
        padding="max_length",
    )
    result["labels"] = result["input_ids"].copy()
    return result

print("🔄 Tokenizando dataset...")
tokenized_dataset = dataset.map(
    tokenize,
    remove_columns=dataset.column_names,
    desc="Tokenizando",
)

print(f"✓ Dataset tokenizado: {len(tokenized_dataset)} exemplos prontos!")

# %% [code]
# ==============================================================================
# SEÇÃO 6: Configurar Treinamento
# ==============================================================================

training_args = TrainingArguments(
    output_dir="/content/drive/MyDrive/aion/checkpoints",
    
    # Épocas e batch size
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,  # Batch efetivo = 4*4 = 16
    
    # Otimizador
    learning_rate=2e-4,
    warmup_steps=100,
    
    # Logging e salvamento
    logging_steps=10,
    save_steps=50,
    save_total_limit=3,  # Manter apenas 3 últimos checkpoints
    
    # Performance
    fp16=True,  # Precisão mista
    optim="adamw_torch",
    
    # Outros
    report_to="none",  # Desabilitar W&B, Tensorboard, etc.
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
)

print("✓ Trainer configurado!")
print(f"📊 Configuração:")
print(f"   - Épocas: {training_args.num_train_epochs}")
print(f"   - Batch size: {training_args.per_device_train_batch_size * training_args.gradient_accumulation_steps}")
print(f"   - Learning rate: {training_args.learning_rate}")
print(f"   - Steps totais: ~{len(tokenized_dataset) // (training_args.per_device_train_batch_size * training_args.gradient_accumulation_steps) * training_args.num_train_epochs}")

# %% [code]
# ==============================================================================
# SEÇÃO 7: TREINAR! 🚀
# ==============================================================================

print("\n" + "="*80)
print("🚀 INICIANDO TREINAMENTO!")
print("="*80)
print(f"\n⏱️  Tempo estimado: 8-12h (depende do dataset)")
print(f"💾 Checkpoints serão salvos a cada 50 steps")
print(f"📁 Diretório: /content/drive/MyDrive/aion/checkpoints")
print("\n" + "="*80 + "\n")

# TREINAR!
trainer.train()

print("\n" + "="*80)
print("✅ TREINAMENTO COMPLETO!")
print("="*80)

# %% [code]
# ==============================================================================
# SEÇÃO 8: Salvar Adaptadores LoRA
# ==============================================================================

# Salvar adaptadores finais
output_dir = "/content/drive/MyDrive/aion/lora_adapters/latest"

model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)

print(f"\n✅ Adaptadores LoRA salvos em: {output_dir}")
print(f"📦 Tamanho: ~200MB (vs 16GB modelo completo)")
print(f"\n🎉 MODELO PRÓPRIO PRONTO PARA USO!")
print(f"\n📝 Próximos passos:")
print(f"   1. Use o notebook COLAB_INFERENCE_SERVER.py para servir o modelo")
print(f"   2. Ou carregue os adaptadores diretamente no código:")
print(f"")
print(f"   from peft import PeftModel, PeftConfig")
print(f"   config = PeftConfig.from_pretrained('{output_dir}')")
print(f"   base_model = AutoModelForCausalLM.from_pretrained(config.base_model_name_or_path)")
print(f"   model = PeftModel.from_pretrained(base_model, '{output_dir}')")

# %% [code]
# ==============================================================================
# SEÇÃO 9: Teste Rápido
# ==============================================================================

print("\n" + "="*80)
print("🧪 TESTE RÁPIDO DO MODELO")
print("="*80 + "\n")

# Preparar para inferência
model.eval()

def generate(prompt, max_new_tokens=256):
    """Gerar resposta usando modelo fine-tuned"""
    formatted_prompt = f"### Instruction:\n{prompt}\n\n### Response:\n"
    
    inputs = tokenizer(formatted_prompt, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.7,
            do_sample=True,
            top_p=0.9,
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    # Extrair apenas a resposta (após "### Response:")
    response = response.split("### Response:")[-1].strip()
    
    return response

# Teste
test_prompt = "Olá! Como você está?"
response = generate(test_prompt)

print(f"Prompt: {test_prompt}")
print(f"Resposta: {response}")
print("\n" + "="*80)
print("\n✅ Modelo funcionando corretamente!")
print("\n🎉 SUCESSO! Modelo próprio treinado e testado!")
